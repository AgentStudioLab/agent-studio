import { describe, expect, it, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { EventType } from "@ag-ui/core";
import { buildAgentAppendContext, computeAgentDirs, runWorker } from "./runWorker";
import { migrate } from "../db";
import type { AGUIEvent } from "../agui/core";
import { ThreadService } from "../services/threads";
import { MessageService } from "../services/messages";
import { createBunSqliteRunStore } from "../agui/store-sqlite/createBunSqliteRunStore";

describe("computeAgentDirs", () => {
  it("treats every folder as readable", () => {
    const dirs = computeAgentDirs([
      { path: "/a", writable: false },
      { path: "/b", writable: true },
    ]);
    expect(dirs.additionalReadDirs).toEqual(["/a", "/b"]);
  });

  it("only writable folders are writable", () => {
    const dirs = computeAgentDirs([
      { path: "/ro", writable: false },
      { path: "/rw", writable: true },
    ]);
    expect(dirs.additionalWriteDirs).toEqual(["/rw"]);
  });

  it("no folders → empty sets", () => {
    expect(computeAgentDirs([])).toEqual({
      additionalReadDirs: [],
      additionalWriteDirs: [],
    });
  });

  it("all read-only → no writable dirs", () => {
    const dirs = computeAgentDirs([
      { path: "/x", writable: false },
      { path: "/y", writable: false },
    ]);
    expect(dirs.additionalReadDirs).toEqual(["/x", "/y"]);
    expect(dirs.additionalWriteDirs).toEqual([]);
  });
});

describe("buildAgentAppendContext", () => {
  const INDEX = "# Memory index\n\n- [User](user.md) — Jay, 前端工程师";

  it("returns CLAUDE.md first, then the memory directive + index verbatim", () => {
    const out = buildAgentAppendContext("Be terse.", INDEX);
    expect(out).not.toBeNull();
    expect(out!.startsWith("Be terse.")).toBe(true);
    expect(out).toContain("# Memory index");
    expect(out).toContain("- [User](user.md) — Jay, 前端工程师");
    // single heading — no double "## Memory index" wrapper
    expect(out).not.toContain("## Memory index");
    // redirect directive present (use our memory, not the preset default)
    expect(out).toContain("remember");
    expect(out).toContain("memory/<slug>.md");
  });
  it("always emits the memory redirect directive, even with no CLAUDE.md or index", () => {
    const out = buildAgentAppendContext(null, "");
    expect(out).not.toBeNull();
    expect(out).toContain("memory/");
    expect(out).toContain("No memories saved yet.");
    expect(out).not.toContain("# Memory index"); // no index heading when empty
  });
  it("CLAUDE.md + memory directive (empty note) when the index is empty", () => {
    const out = buildAgentAppendContext("# Role\nBe concise.", "");
    expect(out).toContain("Be concise.");
    expect(out).toContain("No memories saved yet.");
    expect(out).not.toContain("# Memory index");
  });
  it("no nudge below the warn threshold", () => {
    const out = buildAgentAppendContext(null, INDEX); // short, well under warn
    expect(out).not.toContain("consolidate");
  });
  it("appends a consolidate nudge at/over the warn threshold", () => {
    const big = "- x\n".repeat(500); // 2000 chars >= warn (1600)
    expect(buildAgentAppendContext(null, big)).toContain("consolidate");
  });
  it("appends a reference-links section with one line per link", () => {
    const out = buildAgentAppendContext(null, "", [
      { id: "alk_1", agentWorkspaceId: "a", url: "https://docs.example.com", title: "Docs", createdAt: 0 },
      { id: "alk_2", agentWorkspaceId: "a", url: "https://api.example.com", title: "API", createdAt: 0 },
    ]);
    expect(out).toContain("## Reference links");
    expect(out).toContain("- [Docs](https://docs.example.com)");
    expect(out).toContain("- [API](https://api.example.com)");
    expect(out).toContain("WebFetch");
  });
  it("no links section when the list is empty", () => {
    expect(buildAgentAppendContext("Be terse.", "", [])).not.toContain("Reference links");
  });
});

describe("runWorker remote task extensions", () => {
  async function runWithEvents(
    events: AGUIEvent[],
    opts: {
      appendContextExtra?: string;
      onTerminalResult?: Parameters<typeof runWorker>[0]["onTerminalResult"];
      assistantText?: string;
    } = {},
  ) {
    const db = new Database(":memory:");
    migrate(db);
    const threads = new ThreadService(db);
    const messages = new MessageService(db);
    const store = createBunSqliteRunStore(db);
    threads.create({ id: "thr_1", workingDir: "/tmp" });
    await store.createRun("run_1", "thr_1");
    const seen: Array<string | undefined> = [];
    const provider = {
      name: "fake",
      run(ctx: { appendContext?: string; callbacks?: { onMessageEnd?: (msg: { id: string; content: string }) => void } }) {
        seen.push(ctx.appendContext);
        return (async function* () {
          if (opts.assistantText) {
            ctx.callbacks?.onMessageEnd?.({
              id: "msg_assistant",
              content: opts.assistantText,
            });
          }
          for (const event of events) yield event;
        })();
      },
      resume: async function* () {},
      getPendingInterrupts: async () => [],
    };

    await runWorker({
      runId: "run_1",
      threadId: "thr_1",
      userMessage: { role: "user", content: "hello" },
      store,
      messages,
      threads,
      provider: provider as never,
      interruptBus: { cancelAll: () => {} } as never,
      abortSignal: new AbortController().signal,
      usage: { recordRun: () => {} } as never,
      ...opts,
    });

    return { seen, messages };
  }

  it("appends appendContextExtra to provider appendContext", async () => {
    const { seen } = await runWithEvents(
      [
        { type: EventType.RUN_STARTED, threadId: "thr_1", runId: "run_1" } as never,
        { type: EventType.RUN_FINISHED, threadId: "thr_1", runId: "run_1" } as never,
      ],
      { appendContextExtra: "Remote task context" },
    );

    expect(seen[0]).toBe("Remote task context");
  });

  it("calls onTerminalResult after terminal flush with assistant text", async () => {
    const terminal = mock(async () => {});

    await runWithEvents(
      [
        { type: EventType.RUN_STARTED, threadId: "thr_1", runId: "run_1" } as never,
        { type: EventType.RUN_FINISHED, threadId: "thr_1", runId: "run_1" } as never,
      ],
      { onTerminalResult: terminal, assistantText: "done" },
    );

    expect(terminal).toHaveBeenCalledWith({
      status: "completed",
      assistantText: "done",
      errorMsg: undefined,
    });
  });

  it("reports run error status and message to onTerminalResult", async () => {
    const terminal = mock(async () => {});

    await runWithEvents(
      [
        { type: EventType.RUN_STARTED, threadId: "thr_1", runId: "run_1" } as never,
        {
          type: EventType.RUN_ERROR,
          threadId: "thr_1",
          runId: "run_1",
          message: "provider failed",
        } as never,
      ],
      { onTerminalResult: terminal },
    );

    expect(terminal).toHaveBeenCalledWith({
      status: "error",
      assistantText: "",
      errorMsg: "provider failed",
    });
  });

  it("does not let onTerminalResult errors break terminal run state", async () => {
    await runWithEvents(
      [
        { type: EventType.RUN_STARTED, threadId: "thr_1", runId: "run_1" } as never,
        { type: EventType.RUN_FINISHED, threadId: "thr_1", runId: "run_1" } as never,
      ],
      {
        onTerminalResult: async () => {
          throw new Error("remote callback failed");
        },
      },
    );
  });
});
