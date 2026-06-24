import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "bun:test";
import type { AgentStudioCcrConfig } from "./config";
import {
  ccrPrivateConfigPath,
  ccrPrivateHome,
  ccrPrivatePidPath,
  spawnManagedCcr,
  prepareCcrRuntimeAssets,
  writeCcrPrivateConfig,
} from "./spawn";

function config(): AgentStudioCcrConfig {
  return {
    APIKEY: "router-key",
    HOST: "127.0.0.1",
    PORT: 4567,
    LOG: false,
    NON_INTERACTIVE_MODE: true,
    Providers: [
      {
        name: "conn-openai",
        api_base_url: "https://api.openai.com/v1/chat/completions",
        api_key: "sk-openai",
        models: ["gpt-5.1"],
      },
    ],
    Router: {
      default: "conn-openai,gpt-5.1",
    },
  };
}

describe("CCR spawn adapter", () => {
  it("writes config under an isolated CCR home", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agent-studio-ccr-"));
    try {
      await writeCcrPrivateConfig({ configDir: dir, config: config() });

      expect(ccrPrivateHome(dir)).toBe(dir);
      expect(ccrPrivateConfigPath(dir)).toBe(
        path.join(dir, ".claude-code-router", "config.json"),
      );

      const raw = await readFile(ccrPrivateConfigPath(dir), "utf8");
      expect(JSON.parse(raw)).toEqual(config());
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("starts CCR through the same sidecar binary runner mode", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agent-studio-ccr-"));
    const calls: unknown[] = [];
    try {
      const handle = await spawnManagedCcr(
        {
          port: 4567,
          configDir: dir,
          config: config(),
        },
        {
          sidecarPath: "/private/agent-studio-sidecar",
          cliPath: "/private/ccr/runtime/ccr-cli.js",
          spawnProcess: async (command, args, options) => {
            calls.push({ command, args, options });
            return {
              pid: 4242,
              exited: Promise.resolve(0),
              kill: () => true,
            };
          },
        },
      );

      expect(handle.pid).toBe(4242);
      expect(calls).toEqual([
        {
          command: "/private/agent-studio-sidecar",
          args: [
            "--ccr-runner",
            "--config-dir",
            dir,
            "--cli",
            "/private/ccr/runtime/ccr-cli.js",
            "--port",
            "4567",
          ],
          options: expect.objectContaining({
            env: expect.objectContaining({
              HOME: dir,
              USERPROFILE: dir,
              CCR_PRIVATE_HOME: dir,
              CI: "true",
              FORCE_COLOR: "0",
            }),
          }),
        },
      ]);
      await handle.stop();
      expect(calls).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("removes stale Worker pid files without killing the current sidecar process", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agent-studio-ccr-"));
    const killed: number[] = [];
    try {
      await mkdir(path.dirname(ccrPrivatePidPath(dir)), { recursive: true });
      await Bun.write(ccrPrivatePidPath(dir), `${process.pid}\n`);

      const handle = await spawnManagedCcr(
        {
          port: 4567,
          configDir: dir,
          config: config(),
        },
        {
          sidecarPath: "/private/agent-studio-sidecar",
          cliPath: "/private/ccr/runtime/ccr-cli.js",
          stopExistingPid: async (pid) => {
            killed.push(pid);
          },
          spawnProcess: async () => {
            return {
              pid: 4242,
              exited: Promise.resolve(0),
              kill: () => true,
            };
          },
        },
      );

      expect(killed).toEqual([]);
      expect(await Bun.file(ccrPrivatePidPath(dir)).exists()).toBe(false);
      await handle.stop();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("stops a previous runner-mode sidecar child before starting a new one", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agent-studio-ccr-"));
    const stopped: number[] = [];
    try {
      await mkdir(path.dirname(ccrPrivatePidPath(dir)), { recursive: true });
      await Bun.write(ccrPrivatePidPath(dir), "4241\n");

      const handle = await spawnManagedCcr(
        {
          port: 4567,
          configDir: dir,
          config: config(),
        },
        {
          sidecarPath: "/private/agent-studio-sidecar",
          cliPath: "/private/ccr/runtime/ccr-cli.js",
          isPidAlive: async (pid) => pid === 4241,
          stopExistingPid: async (pid) => {
            stopped.push(pid);
          },
          spawnProcess: async () => ({
            pid: 4242,
            exited: Promise.resolve(0),
            kill: () => true,
          }),
        },
      );

      expect(stopped).toEqual([4241]);
      expect(await Bun.file(ccrPrivatePidPath(dir)).exists()).toBe(false);
      await handle.stop();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("waits for child process exit when stopping CCR", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agent-studio-ccr-"));
    let releaseExit: (() => void) | undefined;
    let killed = false;
    try {
      const handle = await spawnManagedCcr(
        { port: 4567, configDir: dir, config: config() },
        {
          sidecarPath: "/private/agent-studio-sidecar",
          cliPath: "/private/ccr/runtime/ccr-cli.js",
          spawnProcess: async () => ({
            pid: 4242,
            kill: () => {
              killed = true;
              releaseExit?.();
              return true;
            },
            exited: new Promise<number>((resolve) => {
              releaseExit = () => resolve(0);
            }),
          }),
        },
      );

      await handle.stop();
      expect(killed).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("copies bundled CCR assets to a real runtime directory", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agent-studio-ccr-"));
    try {
      const cliAsset = path.join(dir, "virtual-cli.js");
      const wasmAsset = path.join(dir, "virtual.wasm");
      await Bun.write(cliAsset, "console.log('ccr')");
      await Bun.write(wasmAsset, "wasm");

      const runtime = await prepareCcrRuntimeAssets({
        configDir: dir,
        cliAssetPath: cliAsset,
        wasmAssetPath: wasmAsset,
      });

      expect(runtime.cliPath).toBe(path.join(dir, "runtime", "ccr-cli.js"));
      expect(runtime.wasmPath).toBe(path.join(dir, "runtime", "tiktoken_bg.wasm"));
      expect(await readFile(runtime.cliPath, "utf8")).toBe("console.log('ccr')");
      expect(await readFile(path.join(dir, "runtime", "tiktoken_bg.wasm"), "utf8")).toBe(
        "wasm",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
