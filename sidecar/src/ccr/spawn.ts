import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import ccrCliAssetPath from "../../node_modules/@musistudio/claude-code-router/dist/cli.js" with { type: "file" };
import ccrWasmAssetPath from "../../node_modules/@musistudio/claude-code-router/dist/tiktoken_bg.wasm" with { type: "file" };
import type { AgentStudioCcrConfig } from "./config";
import type { CcrProcessHandle, CcrSpawn, CcrSpawnInput } from "./manager";
import { stopPidFromFile } from "./process";
export { ccrPrivatePidPath } from "./process";

interface CcrChildProcessLike {
  pid?: number;
  exited: Promise<number>;
  kill: (signal?: NodeJS.Signals) => boolean | void;
}

type CcrProcessSpawner = (
  command: string,
  args: string[],
  options: {
    env: Record<string, string>;
    stdout: "inherit" | "pipe" | "ignore";
    stderr: "inherit" | "pipe" | "ignore";
  },
) => Promise<CcrChildProcessLike>;

function compactEnv(env: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => {
      return typeof entry[1] === "string";
    }),
  );
}

export function ccrPrivateHome(configDir: string): string {
  return configDir;
}

export function ccrPrivateConfigPath(configDir: string): string {
  return path.join(ccrPrivateHome(configDir), ".claude-code-router", "config.json");
}

export async function writeCcrPrivateConfig(input: {
  configDir: string;
  config: AgentStudioCcrConfig;
}): Promise<string> {
  const configPath = ccrPrivateConfigPath(input.configDir);
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(input.config, null, 2)}\n`, "utf8");
  return configPath;
}

export function resolveCcrCliPath(): string {
  return ccrCliAssetPath;
}

export async function prepareCcrRuntimeAssets(input: {
  configDir: string;
  cliAssetPath?: string;
  wasmAssetPath?: string;
}): Promise<{ cliPath: string; wasmPath: string }> {
  const runtimeDir = path.join(input.configDir, "runtime");
  await mkdir(runtimeDir, { recursive: true });

  const cliPath = path.join(runtimeDir, "ccr-cli.js");
  const wasmPath = path.join(runtimeDir, "tiktoken_bg.wasm");

  await Bun.write(cliPath, await Bun.file(input.cliAssetPath ?? ccrCliAssetPath).arrayBuffer());
  await Bun.write(wasmPath, await Bun.file(input.wasmAssetPath ?? ccrWasmAssetPath).arrayBuffer());

  return { cliPath, wasmPath };
}

function defaultSidecarPath(): string {
  return process.env.AGENT_STUDIO_SIDECAR_PATH ?? process.execPath;
}

async function defaultSpawnProcess(
  command: string,
  args: string[],
  options: Parameters<CcrProcessSpawner>[2],
): Promise<CcrChildProcessLike> {
  const proc = Bun.spawn([command, ...args], options);
  return {
    pid: proc.pid,
    exited: proc.exited,
    kill: (signal) => proc.kill(signal),
  };
}

export async function spawnManagedCcr(
  input: CcrSpawnInput,
  options: {
    cliPath?: string;
    sidecarPath?: string;
    spawnProcess?: CcrProcessSpawner;
    currentPid?: number;
    isPidAlive?: (pid: number) => Promise<boolean>;
    stopExistingPid?: (pid: number, signal?: NodeJS.Signals) => Promise<void>;
  } = {},
): Promise<CcrProcessHandle> {
  const runtimeAssets =
    options.cliPath === undefined
      ? await prepareCcrRuntimeAssets({ configDir: input.configDir })
      : {
          cliPath: options.cliPath,
          wasmPath: path.join(path.dirname(options.cliPath), "tiktoken_bg.wasm"),
        };
  const home = ccrPrivateHome(input.configDir);
  await stopPidFromFile(input.configDir, {
    currentPid: options.currentPid,
    isPidAlive: options.isPidAlive,
    killPid: options.stopExistingPid,
  });

  const sidecarPath = options.sidecarPath ?? defaultSidecarPath();
  const env = compactEnv({
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    CCR_PRIVATE_HOME: home,
    CI: "true",
    FORCE_COLOR: "0",
  });
  const proc = await (options.spawnProcess ?? defaultSpawnProcess)(
    sidecarPath,
    [
      "--ccr-runner",
      "--config-dir",
      input.configDir,
      "--cli",
      runtimeAssets.cliPath,
      "--port",
      String(input.port),
    ],
    {
      env,
      stdout: "inherit",
      stderr: "inherit",
    },
  );

  return {
    pid: proc.pid,
    stop: async (signal = "SIGTERM") => {
      proc.kill(signal);
      await proc.exited.catch(() => {});
    },
  };
}

export const CCR_SPAWN_MANAGED: CcrSpawn = spawnManagedCcr;

export async function prepareManagedCcrConfig(input: CcrSpawnInput): Promise<void> {
  await writeCcrPrivateConfig({
    configDir: input.configDir,
    config: {
      ...input.config,
      PORT: input.port,
      HOST: "127.0.0.1",
      NON_INTERACTIVE_MODE: true,
    },
  });
}
