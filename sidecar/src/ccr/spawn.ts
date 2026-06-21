import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import ccrCliAssetPath from "../../node_modules/@musistudio/claude-code-router/dist/cli.js" with { type: "file" };
import ccrWasmAssetPath from "../../node_modules/@musistudio/claude-code-router/dist/tiktoken_bg.wasm" with { type: "file" };
import type { AgentStudioCcrConfig } from "./config";
import type { CcrProcessHandle, CcrSpawn, CcrSpawnInput } from "./manager";

interface CcrWorkerLike {
  terminate(): Promise<number | void> | number | void;
  addEventListener?: (
    type: "error",
    listener: (event: ErrorEvent) => void,
  ) => void;
}

type CcrWorkerFactory = (
  script: string,
  options: {
    argv: string[];
    env: Record<string, string>;
  },
) => CcrWorkerLike;

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
}): Promise<{ cliPath: string; bootstrapPath: string }> {
  const runtimeDir = path.join(input.configDir, "runtime");
  await mkdir(runtimeDir, { recursive: true });

  const cliPath = path.join(runtimeDir, "ccr-cli.js");
  const bootstrapPath = path.join(runtimeDir, "ccr-bootstrap.js");
  const wasmPath = path.join(runtimeDir, "tiktoken_bg.wasm");

  await Bun.write(cliPath, await Bun.file(input.cliAssetPath ?? ccrCliAssetPath).arrayBuffer());
  await Bun.write(
    bootstrapPath,
    [
      "const os = require('node:os');",
      "const privateHome = process.env.CCR_PRIVATE_HOME;",
      "if (privateHome) os.homedir = () => privateHome;",
      "const [, , cliPath, ...args] = process.argv;",
      "if (!cliPath) throw new Error('ccr_cli_path_missing');",
      "process.argv = [process.argv[0], cliPath, ...args];",
      "require(cliPath);",
      "",
    ].join("\n"),
  );
  await Bun.write(wasmPath, await Bun.file(input.wasmAssetPath ?? ccrWasmAssetPath).arrayBuffer());

  return { cliPath, bootstrapPath };
}

export async function spawnManagedCcr(
  input: CcrSpawnInput,
  options: {
    cliPath?: string;
    workerFactory?: CcrWorkerFactory;
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
      : {
          cliPath: options.cliPath,
          bootstrapPath: path.join(path.dirname(options.cliPath), "bootstrap.js"),
        };
  const cliPath = runtimeAssets.cliPath;
  const bootstrapPath = runtimeAssets.bootstrapPath;
  const workerFactory =
    options.workerFactory ??
    ((script, workerOptions) => new Worker(script, workerOptions));
  const home = ccrPrivateHome(input.configDir);
  const workerEnv = compactEnv({
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    CCR_PRIVATE_HOME: home,
    CI: "true",
    FORCE_COLOR: "0",
  });
  const worker = workerFactory(bootstrapPath, {
    argv: [cliPath, "start"],
    env: workerEnv,
  });

  worker.addEventListener?.("error", (event) => {
    const message =
      "message" in event && typeof event.message === "string"
        ? event.message
        : String(event);
    console.error("[ccr] worker error:", message);
  });

  return {
    kill: () => {
      void worker.terminate();
      return true;
    },
  };
}

export const CCR_SPAWN_MANAGED: CcrSpawn = spawnManagedCcr;
