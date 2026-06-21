import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import ccrCliAssetPath from "../../node_modules/@musistudio/claude-code-router/dist/cli.js" with { type: "file" };
import ccrWasmAssetPath from "../../node_modules/@musistudio/claude-code-router/dist/tiktoken_bg.wasm" with { type: "file" };
import type { AgentStudioCcrConfig } from "./config";
import type { CcrProcessHandle, CcrSpawn, CcrSpawnInput } from "./manager";

interface SpawnedProcessLike {
  pid?: number;
  kill(signal?: NodeJS.Signals): boolean;
  unref(): void;
}

type SpawnProcess = (
  command: string,
  args: string[],
  options: {
    detached: true;
    stdio: "ignore";
    env: NodeJS.ProcessEnv;
  },
) => SpawnedProcessLike;

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
}): Promise<{ cliPath: string }> {
  const runtimeDir = path.join(input.configDir, "runtime");
  await mkdir(runtimeDir, { recursive: true });

  const cliPath = path.join(runtimeDir, "ccr-cli.js");
  const wasmPath = path.join(runtimeDir, "tiktoken_bg.wasm");

  await Bun.write(cliPath, await Bun.file(input.cliAssetPath ?? ccrCliAssetPath).arrayBuffer());
  await Bun.write(wasmPath, await Bun.file(input.wasmAssetPath ?? ccrWasmAssetPath).arrayBuffer());

  return { cliPath };
}

export async function spawnManagedCcr(
  input: CcrSpawnInput,
  options: {
    cliPath?: string;
    spawnProcess?: SpawnProcess;
  } = {},
): Promise<CcrProcessHandle> {
  await writeCcrPrivateConfig({
    configDir: input.configDir,
    config: {
      ...input.config,
      PORT: input.port,
      HOST: "127.0.0.1",
      NON_INTERACTIVE_MODE: true,
    },
  });

  const runtimeAssets =
    options.cliPath === undefined
      ? await prepareCcrRuntimeAssets({ configDir: input.configDir })
      : { cliPath: options.cliPath };
  const cliPath = runtimeAssets.cliPath;
  const spawnProcess = options.spawnProcess ?? spawn;
  const home = ccrPrivateHome(input.configDir);
  const child = spawnProcess(process.execPath, [cliPath, "start"], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      CCR_PRIVATE_HOME: home,
      CI: "true",
      FORCE_COLOR: "0",
    },
  });

  child.unref();

  return {
    pid: child.pid ?? 0,
    kill: (signal) => child.kill(signal),
  };
}

export const CCR_SPAWN_MANAGED: CcrSpawn = spawnManagedCcr;
