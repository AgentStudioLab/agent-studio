import { readFile, rm } from "node:fs/promises";
import path from "node:path";

export function ccrPrivatePidPath(configDir: string): string {
  return path.join(configDir, ".claude-code-router", ".claude-code-router.pid");
}

export async function removePidFile(configDir: string): Promise<void> {
  await rm(ccrPrivatePidPath(configDir), { force: true });
}

export async function readPidFile(configDir: string): Promise<number | null> {
  const pidPath = ccrPrivatePidPath(configDir);
  try {
    const raw = await readFile(pidPath, "utf8");
    const pid = Number.parseInt(raw.trim(), 10);
    if (Number.isFinite(pid) && pid > 0) return pid;
  } catch {
    return null;
  }

  await removePidFile(configDir);
  return null;
}

export interface StopPidFromFileOptions {
  currentPid?: number;
  isPidAlive?: (pid: number) => Promise<boolean>;
  killPid?: (pid: number, signal?: NodeJS.Signals) => Promise<void>;
}

export type StopPidFromFileResult =
  | { stopped: true; pid: number }
  | {
      stopped: false;
      reason: "no_pid" | "pid_not_alive" | "pid_is_current_process";
    };

async function defaultIsPidAlive(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function defaultKillPid(
  pid: number,
  signal: NodeJS.Signals = "SIGTERM",
): Promise<void> {
  process.kill(pid, signal);
}

export async function stopPidFromFile(
  configDir: string,
  options: StopPidFromFileOptions = {},
): Promise<StopPidFromFileResult> {
  const pid = await readPidFile(configDir);
  if (!pid) return { stopped: false, reason: "no_pid" };

  const currentPid = options.currentPid ?? process.pid;
  if (pid === currentPid) {
    await removePidFile(configDir);
    return { stopped: false, reason: "pid_is_current_process" };
  }

  const isPidAlive = options.isPidAlive ?? defaultIsPidAlive;
  if (!(await isPidAlive(pid))) {
    await removePidFile(configDir);
    return { stopped: false, reason: "pid_not_alive" };
  }

  await (options.killPid ?? defaultKillPid)(pid, "SIGTERM");
  await removePidFile(configDir);
  return { stopped: true, pid };
}
