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
  // scheduled-tool.ts (imported transitively via provider) pulls these in.
  createSdkMcpServer: (config: unknown) => config,
  tool: (name: string) => ({ name }),
}));

const { createClaudeProvider, DEFAULT_TASK_TOOLS } = await import("./provider");

async function drain(iterable: AsyncIterable<unknown>) {
  for await (const _ of iterable) {
    // 消费完整 provider stream，确保 querySpy 已捕获 SDK options。
  }
}

function canUseToolFromCall(callIndex: number) {
  const calls = querySpy.mock.calls as unknown[];
  expect(calls.length).toBe(callIndex + 1);
  const callArgs = calls[callIndex] as unknown[];
  const call = callArgs[0] as unknown;
  const options = (call as Record<string, unknown>)?.options as Record<string, unknown>;
  return options?.canUseTool as (
    name: string,
    input: Record<string, unknown>,
    opts: { toolUseID: string; title?: string; description?: string },
  ) => Promise<{ behavior: string; updatedInput?: Record<string, unknown>; message?: string }>;
}

describe("provider sandbox config", () => {
  it("exports SDK task tracking tools", () => {
    expect(DEFAULT_TASK_TOOLS).toEqual(["TaskCreate", "TaskGet", "TaskUpdate", "TaskList"]);
  });

  it("adds SDK task tracking tools to every run's allowedTools", async () => {
    const provider = createClaudeProvider({ apiKey: "k", allowedTools: ["Bash"] });
    const ac = new AbortController();
    const before = querySpy.mock.calls.length;
    await drain(provider.run({
      runId: "r_task_allowed_tools",
      threadId: "t_task_allowed_tools",
      userMessage: { role: "user", content: "hi" },
      abortSignal: ac.signal,
      cwd: "/tmp/proj",
    }));

    const calls = querySpy.mock.calls as unknown[];
    const callArgs = calls[before] as unknown[];
    const call = callArgs[0] as Record<string, unknown>;
    const options = call.options as Record<string, unknown>;
    expect(options.allowedTools).toEqual(["Bash", ...DEFAULT_TASK_TOOLS]);
  });

  it("allows SDK task tracking tools before workspace sandbox and HITL approval", async () => {
    let approvalCalls = 0;
    const provider = createClaudeProvider({
      apiKey: "k",
      interruptBus: {
        requestApproval: async () => {
          approvalCalls++;
          return { behavior: "allow" };
        },
        requestAskUser: async () => ({ answers: {} }),
        resolve: () => true,
        resolveAskUser: () => true,
        cancelAll: () => {},
        seedRules: () => {},
        addRule: () => {},
        getRules: () => new Set<string>(),
      },
    });
    const ac = new AbortController();
    const before = querySpy.mock.calls.length;
    await drain(provider.run({
      runId: "r_task_can_use",
      threadId: "t_task_can_use",
      userMessage: { role: "user", content: "hi" },
      abortSignal: ac.signal,
      cwd: "/tmp/proj",
    }));

    const result = await canUseToolFromCall(before)(
      "TaskCreate",
      { file_path: "/etc/passwd", title: "Plan work" },
      { toolUseID: "task_1" },
    );
    expect(result).toEqual({
      behavior: "allow",
      updatedInput: { file_path: "/etc/passwd", title: "Plan work" },
    });
    expect(approvalCalls).toBe(0);
  });

  it("appends SDK task tracking guidance to the Claude Code preset", async () => {
    const provider = createClaudeProvider({ apiKey: "k" });
    const ac = new AbortController();
    await drain(provider.run({
      runId: "r_task_guidance",
      threadId: "t_task_guidance",
      userMessage: { role: "user", content: "do the multi-step work" },
      abortSignal: ac.signal,
      cwd: "/tmp/proj",
    }));

    const calls = querySpy.mock.calls as unknown[];
    const lastCallArgs = calls[calls.length - 1] as unknown[];
    const lastCall = lastCallArgs[0] as Record<string, unknown>;
    const options = lastCall.options as Record<string, unknown>;
    const systemPrompt = options.systemPrompt as {
      type?: string;
      preset?: string;
      append?: string;
    };
    expect(systemPrompt.type).toBe("preset");
    expect(systemPrompt.preset).toBe("claude_code");
    expect(systemPrompt.append).toContain("Task tracking guidance:");
    expect(systemPrompt.append).toContain("TaskCreate and TaskUpdate");
    expect(systemPrompt.append).toContain("Keep at most one task in_progress at a time.");
  });

  it("can prepend a CCR-compatible skill reminder to systemPrompt.append", async () => {
    const provider = createClaudeProvider({
      apiKey: "k",
      ccrSkillReminderCompat: true,
      resolveSkillsConfig: () => ({
        enabledSkills: ["agent-studio:using-superpowers"],
        skillDescriptions: {
          "agent-studio:using-superpowers": "Load required instructions before answering.",
        },
        pluginPath: "/tmp/built-in",
      }),
    });
    const ac = new AbortController();
    await drain(provider.run({
      runId: "r_skill_compat",
      threadId: "t_skill_compat",
      userMessage: { role: "user", content: "hi" },
      abortSignal: ac.signal,
      cwd: "/tmp/proj",
    }));

    const calls = querySpy.mock.calls as unknown[];
    const lastCallArgs = calls[calls.length - 1] as unknown[];
    const lastCall = lastCallArgs[0] as Record<string, unknown>;
    const options = lastCall.options as Record<string, unknown>;
    const systemPrompt = options.systemPrompt as {
      type?: string;
      preset?: string;
      append?: string;
    };
    expect(systemPrompt.append).toStartWith(
      "<system-reminder>\nThe following skills are available for use with the Skill tool:",
    );
    expect(systemPrompt.append).toContain(
      "- agent-studio:using-superpowers: Load required instructions before answering.",
    );
    expect(systemPrompt.append).toContain("AskUserQuestion guidance:");
  });

  it("does not inject the skill reminder compatibility prompt by default", async () => {
    const provider = createClaudeProvider({
      apiKey: "k",
      resolveSkillsConfig: () => ({
        enabledSkills: ["agent-studio:using-superpowers"],
        skillDescriptions: {
          "agent-studio:using-superpowers": "Load required instructions before answering.",
        },
        pluginPath: "/tmp/built-in",
      }),
    });
    const ac = new AbortController();
    await drain(provider.run({
      runId: "r_skill_no_compat",
      threadId: "t_skill_no_compat",
      userMessage: { role: "user", content: "hi" },
      abortSignal: ac.signal,
      cwd: "/tmp/proj",
    }));

    const calls = querySpy.mock.calls as unknown[];
    const lastCallArgs = calls[calls.length - 1] as unknown[];
    const lastCall = lastCallArgs[0] as Record<string, unknown>;
    const options = lastCall.options as Record<string, unknown>;
    const systemPrompt = options.systemPrompt as { append?: string };
    expect(systemPrompt.append).not.toContain(
      "The following skills are available for use with the Skill tool:",
    );
  });

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

  it("does not load user Claude Code settings that can override provider env", async () => {
    const provider = createClaudeProvider({
      apiKey: "deepseek-key",
      baseUrl: "https://api.deepseek.com/anthropic",
      model: "deepseek-chat",
    });
    const ac = new AbortController();
    const stream = provider.run({
      runId: "r_settings",
      threadId: "t_settings",
      userMessage: { role: "user", content: "hi" },
      abortSignal: ac.signal,
      cwd: "/tmp/proj",
    });
    for await (const _ of stream) { /* ignore */ }

    const calls = querySpy.mock.calls as unknown[];
    const lastCallArgs = calls[calls.length - 1] as unknown[];
    const lastCall = lastCallArgs[0] as Record<string, unknown>;
    const options = lastCall.options as Record<string, unknown>;
    expect(options.settingSources).toEqual([]);
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
      seedRules: () => {},
      addRule: () => {},
      getRules: () => new Set<string>(),
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
      seedRules: () => {},
      addRule: () => {},
      getRules: () => new Set<string>(),
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

  it("appends AskUserQuestion usage guidance to the Claude Code preset", async () => {
    const provider = createClaudeProvider({ apiKey: "k" });
    const ac = new AbortController();
    await drain(provider.run({
      runId: "r_ask_user_guidance",
      threadId: "t_ask_user_guidance",
      userMessage: { role: "user", content: "推荐几部科幻电影" },
      abortSignal: ac.signal,
      cwd: "/tmp/proj",
    }));

    const calls = querySpy.mock.calls as unknown[];
    const lastCallArgs = calls[calls.length - 1] as unknown[];
    const lastCall = lastCallArgs[0] as Record<string, unknown>;
    const options = lastCall.options as Record<string, unknown>;
    const systemPrompt = options.systemPrompt as {
      type?: string;
      preset?: string;
      append?: string;
    };
    expect(systemPrompt.type).toBe("preset");
    expect(systemPrompt.preset).toBe("claude_code");
    expect(systemPrompt.append).toContain("AskUserQuestion");
    expect(systemPrompt.append).toContain("preferences");
  });

  it("routes AskUserQuestion through requestAskUser even in act-without-asking mode", async () => {
    const askCalls: unknown[] = [];
    let approvalCalls = 0;

    const provider = createClaudeProvider({
      apiKey: "test",
      interruptBus: {
        requestApproval: async () => {
          approvalCalls++;
          return { behavior: "allow" };
        },
        requestAskUser: async (req) => {
          askCalls.push(req);
          return { answers: { "color?": "Red" } };
        },
        resolve: () => false,
        resolveAskUser: () => false,
        cancelAll: () => {},
        seedRules: () => {},
        addRule: () => {},
        getRules: () => new Set<string>(),
      },
    });

    const ac = new AbortController();
    const before = querySpy.mock.calls.length;
    await drain(provider.run({
      runId: "r1",
      threadId: "t1",
      userMessage: { role: "user", content: "hi" },
      cwd: "/tmp",
      permissionMode: "act-without-asking",
      abortSignal: ac.signal,
    }));

    const questions = [
      {
        question: "color?",
        header: "Color",
        multiSelect: false,
        options: [{ label: "Red", description: "Warm" }],
      },
    ];
    const canUseTool = canUseToolFromCall(before);
    const result = await canUseTool("AskUserQuestion", {
      questions,
    }, { toolUseID: "ask_1" });

    expect(approvalCalls).toBe(0);
    expect(askCalls).toEqual([
      {
        runId: "r1",
        threadId: "t1",
        toolUseID: "ask_1",
        questions,
      },
    ]);
    expect(result).toEqual({
      behavior: "allow",
      updatedInput: {
        questions,
        answers: { "color?": "Red" },
      },
    });
  });

  it("allows malformed AskUserQuestion input so the SDK tool reports its own error", async () => {
    let askCalls = 0;
    let approvalCalls = 0;

    const provider = createClaudeProvider({
      apiKey: "test",
      interruptBus: {
        requestApproval: async () => {
          approvalCalls++;
          throw new Error("approval should not be called");
        },
        requestAskUser: async () => {
          askCalls++;
          return { answers: {} };
        },
        resolve: () => false,
        resolveAskUser: () => false,
        cancelAll: () => {},
        seedRules: () => {},
        addRule: () => {},
        getRules: () => new Set<string>(),
      },
    });

    const ac = new AbortController();
    const before = querySpy.mock.calls.length;
    await drain(provider.run({
      runId: "r1",
      threadId: "t1",
      userMessage: { role: "user", content: "hi" },
      cwd: "/tmp",
      permissionMode: "ask",
      abortSignal: ac.signal,
    }));

    const result = await canUseToolFromCall(before)("AskUserQuestion", {}, { toolUseID: "ask_bad" });
    expect(approvalCalls).toBe(0);
    expect(askCalls).toBe(0);
    expect(result).toEqual({ behavior: "allow", updatedInput: {} });
  });
});
