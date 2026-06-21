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
    expect(manager.status()).toEqual({
      enabled: false,
      running: false,
      baseUrl: "http://127.0.0.1:3456",
      error: "ccr_disabled",
    });
  });

  it("spawns once and reuses the running process", async () => {
    let calls = 0;
    const handle: CcrProcessHandle = { pid: 42, kill: () => true };
    const spawn: CcrSpawn = async () => {
      calls += 1;
      return handle;
    };
    const manager = new CcrManager({
      enabled: true,
      port: 3456,
      configDir: "/tmp/agent-studio-ccr",
      spawn,
    });

    await manager.ensure(config());
    await manager.ensure(config());

    expect(calls).toBe(1);
    expect(manager.status()).toEqual({
      enabled: true,
      running: true,
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
        kill: () => {
          kills += 1;
          return true;
        },
      };
    };
    const manager = new CcrManager({
      enabled: true,
      port: 3456,
      configDir: "/tmp/agent-studio-ccr",
      spawn,
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
});
