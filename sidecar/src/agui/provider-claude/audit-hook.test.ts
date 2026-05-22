import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { migrate } from "../../db";
import { AuditService } from "../../services/audit";
import { createAuditHooks } from "./audit-hook";

describe("createAuditHooks", () => {
  it("pre hook writes a row with redacted input", async () => {
    const db = new Database(":memory:");
    migrate(db);
    const audit = new AuditService(db);
    const { pre } = createAuditHooks(audit, { threadId: "t", runId: "r" });

    await pre(
      {
        hook_event_name: "PreToolUse",
        session_id: "s1",
        tool_name: "Bash",
        tool_use_id: "u1",
        tool_input: { command: "echo TOKEN=abcdefghijklmnopqrstuvwxyz" },
        cwd: "/tmp",
        transcript_path: "",
      } as never,
      undefined,
      { signal: new AbortController().signal },
    );

    const row = db.prepare("SELECT * FROM tool_audit").get() as { input_json: string; tool_name: string; thread_id: string };
    expect(row.thread_id).toBe("t");
    expect(row.tool_name).toBe("Bash");
    expect(row.input_json).toContain("***");
  });

  it("post hook writes a row with duration_ms", async () => {
    const db = new Database(":memory:");
    migrate(db);
    const audit = new AuditService(db);
    const { post } = createAuditHooks(audit, { threadId: "t", runId: "r" });

    await post(
      {
        hook_event_name: "PostToolUse",
        session_id: "s1",
        tool_name: "Read",
        tool_use_id: "u1",
        tool_input: { file_path: "/tmp/x" },
        tool_response: "ok",
        duration_ms: 42,
        cwd: "/tmp",
        transcript_path: "",
      } as never,
      undefined,
      { signal: new AbortController().signal },
    );

    const row = db.prepare("SELECT * FROM tool_audit").get() as { duration_ms: number; phase: string };
    expect(row.phase).toBe("post");
    expect(row.duration_ms).toBe(42);
  });

  it("returns no-op output for non-target events", async () => {
    const db = new Database(":memory:");
    migrate(db);
    const audit = new AuditService(db);
    const { pre } = createAuditHooks(audit, { threadId: "t", runId: "r" });

    const out = await pre(
      { hook_event_name: "Notification" } as never,
      undefined,
      { signal: new AbortController().signal },
    );
    expect(out).toEqual({});
    expect(db.prepare("SELECT count(*) as c FROM tool_audit").get()).toEqual({ c: 0 } as never);
  });
});
