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

  // SDK 0.3.144 zod schema requires `updatedInput: Record` on every allow
   // result — bare `{behavior: "allow"}` blows up at runtime with:
   //   ZodError: path:["updatedInput"], expected:"record", received undefined
   // We extract `canUseTool` from the SDK call args and exercise both branches.
  it("canUseTool fills updatedInput on allow (bus + no-bus paths)", async () => {
    const fakeBus = {
      requestApproval: async () => ({ behavior: "allow" as const }),
      requestAskUser: async () => ({ answers: {} }),
      resolve: () => true,
      resolveAskUser: () => true,
      cancelAll: () => {},
    };
    const provider = createClaudeProvider({ apiKey: "k", interruptBus: fakeBus });
    const ac = new AbortController();
    const stream = provider.run({
      runId: "r3",
      threadId: "t3",
      userMessage: { role: "user", content: "hi" },
      abortSignal: ac.signal,
      cwd: "/tmp/proj",
    });
    for await (const _ of stream) { /* ignore */ }

    const calls = querySpy.mock.calls as unknown[];
    const lastCallArgs = calls[calls.length - 1] as unknown[];
    const lastCall = lastCallArgs[0] as unknown;
    const options = (lastCall as Record<string, unknown>)?.options as Record<string, unknown>;
    const canUseTool = options?.canUseTool as (
      name: string,
      input: Record<string, unknown>,
      opts: { toolUseID: string; title?: string; description?: string },
    ) => Promise<{ behavior: string; updatedInput?: Record<string, unknown>; message?: string }>;

    // Bus path: bus returns bare allow → provider must inject updatedInput
    const allowedFromBus = await canUseTool("Bash", { command: "ls" }, { toolUseID: "tu_1" });
    expect(allowedFromBus.behavior).toBe("allow");
    expect(allowedFromBus.updatedInput).toEqual({ command: "ls" });

    // Sandbox deny path stays untouched (no updatedInput, has message)
    const sandboxDenied = await canUseTool("Read", { file_path: "/etc/passwd" }, { toolUseID: "tu_2" });
    expect(sandboxDenied.behavior).toBe("deny");
    expect(typeof sandboxDenied.message).toBe("string");
  });

  it("act-without-asking short-circuits canUseTool (bus.requestApproval NOT called)", async () => {
    let approvalCalls = 0;
    const fakeBus = {
      requestApproval: async () => {
        approvalCalls++;
        return { behavior: "allow" as const };
      },
      requestAskUser: async () => ({ answers: {} }),
      resolve: () => true,
      resolveAskUser: () => true,
      cancelAll: () => {},
    };
    const provider = createClaudeProvider({ apiKey: "k", interruptBus: fakeBus });
    const ac = new AbortController();
    const stream = provider.run({
      runId: "r_act",
      threadId: "t_act",
      userMessage: { role: "user", content: "hi" },
      abortSignal: ac.signal,
      cwd: "/tmp/proj",
      permissionMode: "act-without-asking",
    });
    for await (const _ of stream) { /* ignore */ }

    const calls = querySpy.mock.calls as unknown[];
    const lastCallArgs = calls[calls.length - 1] as unknown[];
    const lastCall = lastCallArgs[0] as unknown;
    const options = (lastCall as Record<string, unknown>)?.options as Record<string, unknown>;
    const canUseTool = options?.canUseTool as (
      name: string,
      input: Record<string, unknown>,
      opts: { toolUseID: string },
    ) => Promise<{ behavior: string; updatedInput?: Record<string, unknown> }>;

    const result = await canUseTool("Write", { file_path: "/tmp/proj/x", content: "hi" }, { toolUseID: "tu_x" });
    expect(result.behavior).toBe("allow");
    expect(result.updatedInput).toEqual({ file_path: "/tmp/proj/x", content: "hi" });
    // Bus must NOT be consulted in autopilot mode
    expect(approvalCalls).toBe(0);
  });

  it("canUseTool no-bus path also includes updatedInput on allow", async () => {
    // Provider built without interruptBus — fast-allow path
    const provider = createClaudeProvider({ apiKey: "k" });
    const ac = new AbortController();
    const stream = provider.run({
      runId: "r4",
      threadId: "t4",
      userMessage: { role: "user", content: "hi" },
      abortSignal: ac.signal,
      cwd: "/tmp/proj",
    });
    for await (const _ of stream) { /* ignore */ }

    const calls = querySpy.mock.calls as unknown[];
    const lastCallArgs = calls[calls.length - 1] as unknown[];
    const lastCall = lastCallArgs[0] as unknown;
    const options = (lastCall as Record<string, unknown>)?.options as Record<string, unknown>;
    const canUseTool = options?.canUseTool as (
      name: string,
      input: Record<string, unknown>,
      opts: { toolUseID: string },
    ) => Promise<{ behavior: string; updatedInput?: Record<string, unknown> }>;

    const result = await canUseTool("Bash", { command: "echo hi" }, { toolUseID: "tu_no_bus" });
    expect(result.behavior).toBe("allow");
    expect(result.updatedInput).toEqual({ command: "echo hi" });
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
