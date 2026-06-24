import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, mock } from "bun:test";
import {
  ccrPrivatePidPath,
  readPidFile,
  stopPidFromFile,
} from "./process";

describe("CCR process helpers", () => {
  it("reads numeric private pid files", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agent-studio-ccr-"));
    try {
      await Bun.write(ccrPrivatePidPath(dir), "12345\n");
      expect(await readPidFile(dir)).toBe(12345);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("removes invalid pid files", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agent-studio-ccr-"));
    try {
      await Bun.write(ccrPrivatePidPath(dir), "not-a-pid");
      expect(await readPidFile(dir)).toBeNull();
      expect(await Bun.file(ccrPrivatePidPath(dir)).exists()).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not kill the current process when stale Worker pid points at sidecar", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agent-studio-ccr-"));
    const killPid = mock(async () => {});
    try {
      await Bun.write(ccrPrivatePidPath(dir), `${process.pid}\n`);

      const result = await stopPidFromFile(dir, {
        currentPid: process.pid,
        isPidAlive: async () => true,
        killPid,
      });

      expect(result).toEqual({ stopped: false, reason: "pid_is_current_process" });
      expect(killPid).not.toHaveBeenCalled();
      expect(await Bun.file(ccrPrivatePidPath(dir)).exists()).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("kills a live external CCR runner pid and removes pid file", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agent-studio-ccr-"));
    const killed: number[] = [];
    try {
      await Bun.write(ccrPrivatePidPath(dir), "4242\n");

      const result = await stopPidFromFile(dir, {
        currentPid: 111,
        isPidAlive: async (pid) => pid === 4242,
        killPid: async (pid) => {
          killed.push(pid);
        },
      });

      expect(result).toEqual({ stopped: true, pid: 4242 });
      expect(killed).toEqual([4242]);
      expect(await Bun.file(ccrPrivatePidPath(dir)).exists()).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
