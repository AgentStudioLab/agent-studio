import os from "node:os";
import path from "node:path";

export interface CcrRunnerArgs {
  configDir: string;
  cliPath: string;
  port?: number;
}

function readArg(argv: string[], name: string): string | null {
  const index = argv.indexOf(name);
  if (index === -1) return null;
  return argv[index + 1] ?? null;
}

export function isCcrRunnerMode(argv: string[]): boolean {
  return argv.includes("--ccr-runner");
}

export function parseCcrRunnerArgs(argv: string[]): CcrRunnerArgs {
  const configDir = readArg(argv, "--config-dir");
  const cliPath = readArg(argv, "--cli");
  const portRaw = readArg(argv, "--port");

  if (!configDir) throw new Error("ccr_runner_config_dir_missing");
  if (!cliPath) throw new Error("ccr_runner_cli_missing");

  let port: number | undefined;
  if (portRaw !== null) {
    const parsedPort = Number.parseInt(portRaw, 10);
    if (!Number.isInteger(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
      throw new Error(`ccr_runner_invalid_port:${portRaw}`);
    }
    port = parsedPort;
  }

  return { configDir, cliPath, port };
}

export function buildCcrRunnerProcessArgv(cliPath: string): string[] {
  return [process.argv[0] ?? "agent-studio-sidecar", cliPath, "start"];
}

export function runCcrRunnerMode(argv: string[]): void {
  const { configDir, cliPath } = parseCcrRunnerArgs(argv);

  // CCR 通过 os.homedir()/HOME 定位 config.json 和 pid file；runner 子进程
  // 必须绑定到应用私有目录，不能污染用户真实 ~/.claude-code-router。
  process.env.HOME = configDir;
  process.env.USERPROFILE = configDir;
  process.env.CCR_PRIVATE_HOME = configDir;
  process.env.CI = "true";
  process.env.FORCE_COLOR = "0";

  os.homedir = () => configDir;
  process.argv = buildCcrRunnerProcessArgv(cliPath);
  require(path.resolve(cliPath));
}
