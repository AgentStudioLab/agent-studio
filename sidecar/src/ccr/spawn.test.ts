import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "bun:test";
import type { AgentStudioCcrConfig } from "./config";
import {
  ccrPrivateConfigPath,
  ccrPrivateHome,
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

  it("starts ccr in an isolated Worker instead of re-executing the sidecar binary", async () => {
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
          cliPath: "/private/ccr/dist/cli.js",
          workerFactory: (script, options) => {
            calls.push({ script, options });
            return {
              terminate: () => Promise.resolve(),
            };
          },
        },
      );

      expect(calls).toEqual([
        {
          script: "/private/ccr/dist/bootstrap.js",
          options: expect.objectContaining({
            argv: ["/private/ccr/dist/cli.js", "start"],
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
      expect(handle.kill()).toBe(true);
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
      expect(runtime.bootstrapPath).toBe(
        path.join(dir, "runtime", "ccr-bootstrap.js"),
      );
      expect(await readFile(runtime.cliPath, "utf8")).toBe("console.log('ccr')");
      expect(await readFile(runtime.bootstrapPath, "utf8")).toContain(
        "CCR_PRIVATE_HOME",
      );
      expect(await readFile(runtime.bootstrapPath, "utf8")).toContain(
        "process.argv = [process.argv[0], cliPath, ...args]",
      );
      expect(await readFile(path.join(dir, "runtime", "tiktoken_bg.wasm"), "utf8")).toBe(
        "wasm",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
