import { describe, expect, it, mock } from "bun:test";

// Mock SDK before importing provider
const querySpy = mock(() => ({
  [Symbol.asyncIterator]: async function* () {
    yield { type: "result", subtype: "success", is_error: false, result: "ok", session_id: "s", usage: {}, total_cost_usd: 0, permission_denials: [] };
  },
}));

mock.module("@anthropic-ai/claude-agent-sdk", () => ({
  query: querySpy,
  listSessions: async () => [],
  tagSession: async () => {},
}));

const { createClaudeProvider } = await import("./provider");

describe("provider sandbox config", () => {
  it("passes sandbox.filesystem.allowWrite=[cwd] to sdkQuery", async () => {
    const provider = createClaudeProvider({ apiKey: "k", allowedTools: ["Bash"] });
    const ac = new AbortController();
    const stream = provider.run({
      runId: "r1",
      threadId: "t1",
      userMessage: { role: "user", content: "hi" },
      abortSignal: ac.signal,
      cwd: "/tmp/proj",
    });
    // Drain to ensure the SDK call happened
    for await (const _ of stream) { /* ignore */ }

    expect(querySpy).toHaveBeenCalled();
    const lastCall = querySpy.mock.calls.at(-1)![0] as { options: { sandbox?: { enabled: boolean; filesystem?: { allowWrite?: string[] } } } };
    expect(lastCall.options.sandbox?.enabled).toBe(true);
    expect(lastCall.options.sandbox?.filesystem?.allowWrite).toEqual(["/tmp/proj"]);
  });
});
