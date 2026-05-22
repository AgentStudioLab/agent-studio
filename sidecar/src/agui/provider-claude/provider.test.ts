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
    const calls = querySpy.mock.calls as unknown[];
    expect(calls.length).toBeGreaterThan(0);
    const lastCallArgs = calls[calls.length - 1] as unknown[];
    const lastCall = lastCallArgs[0] as unknown;
    const options = (lastCall as Record<string, unknown>)?.options as Record<string, unknown>;
    const sandbox = options?.sandbox as Record<string, unknown>;
    expect(sandbox?.enabled).toBe(true);
    const filesystem = sandbox?.filesystem as Record<string, unknown>;
    expect(filesystem?.allowWrite).toEqual(["/tmp/proj"]);
  });

  it("forces mutation tools through canUseTool via permissions.ask", async () => {
    const provider = createClaudeProvider({ apiKey: "k", allowedTools: ["Bash"] });
    const ac = new AbortController();
    const stream = provider.run({
      runId: "r2",
      threadId: "t2",
      userMessage: { role: "user", content: "hi" },
      abortSignal: ac.signal,
      cwd: "/tmp/proj",
    });
    for await (const _ of stream) { /* ignore */ }

    const calls = querySpy.mock.calls as unknown[];
    const lastCallArgs = calls[calls.length - 1] as unknown[];
    const lastCall = lastCallArgs[0] as unknown;
    const options = (lastCall as Record<string, unknown>)?.options as Record<string, unknown>;
    const sandbox = options?.sandbox as Record<string, unknown>;
    expect(sandbox?.autoAllowBashIfSandboxed).toBe(false);
    const settings = options?.settings as { permissions?: { ask?: string[] } };
    expect(settings?.permissions?.ask).toContain("Write(*)");
    expect(settings?.permissions?.ask).toContain("Bash(*)");
    expect(settings?.permissions?.ask).toContain("Edit(*)");
    expect(settings?.permissions?.ask).toContain("MultiEdit(*)");
    expect(settings?.permissions?.ask).toContain("WebFetch(*)");
  });
});
