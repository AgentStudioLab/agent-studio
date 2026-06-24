import { describe, expect, it } from "bun:test";
import {
  CcrManager,
  type CcrProcessHandle,
  type CcrSpawn,
} from "./manager";
import type { AgentStudioCcrConfig } from "./config";

function config(): AgentStudioCcrConfig {
  return {
    APIKEY: "router-key",
    HOST: "127.0.0.1",
    PORT: 3456,
    LOG: false,
    NON_INTERACTIVE_MODE: true,
    Providers: [
      {
        name: "agentstudio_conn_gpt-5.1",
        api_base_url: "https://api.openai.com/v1/chat/completions",
        api_key: "sk",
        models: ["gpt-5.1"],
      },
    ],
    Router: {
      default: "agentstudio_conn_gpt-5.1,gpt-5.1",
    },
  };
}

describe("CcrManager", () => {
  it("reports disabled without spawning", async () => {
    let calls = 0;
    const manager = new CcrManager({
      enabled: false,
      port: 3456,
      configDir: "/tmp/agent-studio-ccr",
      spawn: async () => {
        calls += 1;
        throw new Error("should_not_spawn");
      },
    });

    await manager.ensure(config());

    expect(calls).toBe(0);
    expect(manager.status()).toMatchObject({
      enabled: false,
      running: false,
      phase: "disabled",
      baseUrl: "http://127.0.0.1:3456",
      routeCount: 0,
      routeKeys: [],
      error: "ccr_disabled",
    });
  });

  it("spawns once and reuses the running process", async () => {
    let calls = 0;
    const handle: CcrProcessHandle = { pid: 42, stop: async () => {} };
    const spawn: CcrSpawn = async () => {
      calls += 1;
      return handle;
    };
    const manager = new CcrManager({
      enabled: true,
      port: 3456,
      configDir: "/tmp/agent-studio-ccr",
      spawn,
      waitForReady: async () => {},
      waitForStopped: async () => {},
    });

    await manager.ensure(config());
    await manager.ensure(config());

    expect(calls).toBe(1);
    expect(manager.status()).toMatchObject({
      enabled: true,
      running: true,
      phase: "ready",
      baseUrl: "http://127.0.0.1:3456",
      pid: 42,
    });
  });

  it("restarts when the desired config changes", async () => {
    let calls = 0;
    let kills = 0;
    const seenDefaults: string[] = [];
    const spawn: CcrSpawn = async (input) => {
      calls += 1;
      seenDefaults.push(input.config.Router.default);
      return {
        pid: 40 + calls,
        stop: async () => {
          kills += 1;
        },
      };
    };
    const manager = new CcrManager({
      enabled: true,
      port: 3456,
      configDir: "/tmp/agent-studio-ccr",
      spawn,
      waitForReady: async () => {},
      waitForStopped: async () => {},
    });
    const first = config();
    const second = {
      ...config(),
      Providers: [
        {
          name: "agentstudio_conn_gpt-5.5",
          api_base_url: "https://api.openai.com/v1/chat/completions",
          api_key: "sk",
          models: ["gpt-5.5"],
        },
      ],
      Router: {
        default: "agentstudio_conn_gpt-5.5,gpt-5.5",
      },
    };

    await manager.ensure(first);
    await manager.ensure(second);

    expect(calls).toBe(2);
    expect(kills).toBe(1);
    expect(seenDefaults).toEqual([
      "agentstudio_conn_gpt-5.1,gpt-5.1",
      "agentstudio_conn_gpt-5.5,gpt-5.5",
    ]);
    expect(manager.status()).toMatchObject({
      running: true,
      pid: 42,
    });
  });

  it("waits for the old process to stop before spawning the changed config", async () => {
    const events: string[] = [];
    let releaseStop: (() => void) | undefined;
    const spawn: CcrSpawn = async (input) => {
      events.push(`spawn:${input.config.Router.default}`);
      return {
        pid: events.length,
        stop: async () => {
          events.push("stop:start");
          await new Promise<void>((resolve) => {
            releaseStop = resolve;
          });
          events.push("stop:done");
        },
      };
    };
    const manager = new CcrManager({
      enabled: true,
      port: 3456,
      configDir: "/tmp/agent-studio-ccr",
      spawn,
      waitForReady: async () => {},
      waitForStopped: async () => {
        events.push("port:closed");
      },
    });
    const second = {
      ...config(),
      Router: { default: "agentstudio_conn_gpt-5.5,gpt-5.5" },
    };

    await manager.applyConfig(config(), ["agentstudio/conn/gpt-5.1"]);
    const applying = manager.applyConfig(second, ["agentstudio/conn/gpt-5.5"]);
    await Bun.sleep(0);

    expect(events).toEqual([
      "spawn:agentstudio_conn_gpt-5.1,gpt-5.1",
      "stop:start",
    ]);

    releaseStop?.();
    await applying;

    expect(events).toEqual([
      "spawn:agentstudio_conn_gpt-5.1,gpt-5.1",
      "stop:start",
      "stop:done",
      "port:closed",
      "spawn:agentstudio_conn_gpt-5.5,gpt-5.5",
    ]);
  });

  it("prepares the next config after the old process has stopped", async () => {
    const events: string[] = [];
    let releaseStop: (() => void) | undefined;
    const spawn: CcrSpawn = async (input) => {
      events.push(`spawn:${input.config.Router.default}`);
      return {
        stop: async () => {
          events.push("stop:start");
          await new Promise<void>((resolve) => {
            releaseStop = resolve;
          });
          events.push("stop:done");
        },
      };
    };
    const manager = new CcrManager({
      enabled: true,
      port: 3456,
      configDir: "/tmp/agent-studio-ccr",
      spawn,
      prepareConfig: async (input) => {
        events.push(`prepare:${input.config.Router.default}`);
      },
      waitForReady: async () => {},
      waitForStopped: async () => {},
    });
    const second = {
      ...config(),
      Router: { default: "agentstudio_conn_gpt-5.5,gpt-5.5" },
    };

    await manager.applyConfig(config(), ["agentstudio/conn/gpt-5.1"]);
    const applying = manager.applyConfig(second, ["agentstudio/conn/gpt-5.5"]);
    await Bun.sleep(0);

    expect(events).toEqual([
      "prepare:agentstudio_conn_gpt-5.1,gpt-5.1",
      "spawn:agentstudio_conn_gpt-5.1,gpt-5.1",
      "stop:start",
    ]);

    releaseStop?.();
    await applying;

    expect(events).toEqual([
      "prepare:agentstudio_conn_gpt-5.1,gpt-5.1",
      "spawn:agentstudio_conn_gpt-5.1,gpt-5.1",
      "stop:start",
      "stop:done",
      "prepare:agentstudio_conn_gpt-5.5,gpt-5.5",
      "spawn:agentstudio_conn_gpt-5.5,gpt-5.5",
    ]);
  });

  it("keeps the old process handle when stop hangs", async () => {
    let calls = 0;
    const spawn: CcrSpawn = async () => {
      calls += 1;
      return {
        pid: calls,
        stop: async () => {
          await new Promise<void>(() => {});
        },
      };
    };
    const manager = new CcrManager({
      enabled: true,
      port: 3456,
      configDir: "/tmp/agent-studio-ccr",
      spawn,
      waitForReady: async () => {},
      waitForStopped: async () => {},
      stopTimeoutMs: 5,
    });
    const second = {
      ...config(),
      Router: { default: "agentstudio_conn_gpt-5.5,gpt-5.5" },
    };

    await manager.applyConfig(config(), ["agentstudio/conn/gpt-5.1"]);
    await expect(
      manager.applyConfig(second, ["agentstudio/conn/gpt-5.5"]),
    ).rejects.toThrow("ccr_stop_timeout");

    expect(manager.status()).toMatchObject({
      running: true,
      phase: "error",
      pid: 1,
      error: "ccr_stop_timeout",
    });
  });

  it("cleans up a newly spawned process when readiness fails", async () => {
    let stopped = 0;
    const manager = new CcrManager({
      enabled: true,
      port: 3456,
      configDir: "/tmp/agent-studio-ccr",
      spawn: async () => ({
        pid: 42,
        stop: async () => {
          stopped += 1;
        },
      }),
      waitForReady: async () => {
        throw new Error("ccr_not_ready:timeout");
      },
      waitForStopped: async () => {},
    });

    await expect(
      manager.applyConfig(config(), ["agentstudio/conn/gpt-5.1"]),
    ).rejects.toThrow("ccr_not_ready:timeout");

    expect(stopped).toBe(1);
    expect(manager.status()).toMatchObject({
      running: false,
      phase: "error",
      error: "ccr_not_ready:timeout",
    });
  });

  it("keeps the newly spawned handle when readiness cleanup fails", async () => {
    const manager = new CcrManager({
      enabled: true,
      port: 3456,
      configDir: "/tmp/agent-studio-ccr",
      spawn: async () => ({
        pid: 42,
        stop: async () => {
          throw new Error("cleanup_failed");
        },
      }),
      waitForReady: async () => {
        throw new Error("ccr_not_ready:timeout");
      },
      waitForStopped: async () => {},
    });

    await expect(
      manager.applyConfig(config(), ["agentstudio/conn/gpt-5.1"]),
    ).rejects.toThrow("ccr_not_ready:timeout");

    expect(manager.status()).toMatchObject({
      running: true,
      phase: "error",
      pid: 42,
      error: "ccr_not_ready:timeout",
    });
  });

  it("reports route keys and config signature for diagnostics", async () => {
    const manager = new CcrManager({
      enabled: true,
      port: 3456,
      configDir: "/tmp/agent-studio-ccr",
      spawn: async () => ({ pid: 42, stop: async () => {} }),
      waitForReady: async () => {},
    });

    await manager.applyConfig(config(), ["agentstudio/conn/gpt-5.1"]);

    expect(manager.status()).toMatchObject({
      enabled: true,
      running: true,
      phase: "ready",
      routeKeys: ["agentstudio/conn/gpt-5.1"],
      routeCount: 1,
      pid: 42,
    });
    expect(manager.status().configSignature).toBeString();
    expect(manager.status().configSignature).not.toContain("sk");
    expect(manager.status().configSignature).not.toContain("gpt-5.1");
  });
});
