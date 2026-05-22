import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { migrate } from "../db";
import { AuditService } from "./audit";

function makeDb() {
  const db = new Database(":memory:");
  migrate(db);
  return db;
}

describe("AuditService", () => {
  it("appendPre stores redacted input", () => {
    const db = makeDb();
    const svc = new AuditService(db);
    svc.appendPre({
      ts: 100,
      sessionId: "sess",
      threadId: "thread",
      runId: "run",
      toolName: "Bash",
      toolUseId: "u1",
      input: { command: "echo API_KEY=sk-abcdefghijklmnop12345" },
      cwd: "/tmp",
    });
    const row = db.prepare("SELECT * FROM tool_audit WHERE phase='pre'").get() as { tool_name: string; input_json: string };
    expect(row.tool_name).toBe("Bash");
    expect(row.input_json).toContain("***");
    expect(row.input_json).not.toContain("sk-abcdefghijklmnop12345");
  });

  it("appendPost stores duration_ms", () => {
    const db = makeDb();
    const svc = new AuditService(db);
    svc.appendPost({
      ts: 100,
      sessionId: "sess",
      toolName: "Read",
      toolUseId: "u1",
      durationMs: 42,
      isError: false,
      cwd: "/tmp",
    });
    const row = db.prepare("SELECT * FROM tool_audit WHERE phase='post'").get() as { duration_ms: number };
    expect(row.duration_ms).toBe(42);
  });

  it("queryByThread returns rows filtered + sorted desc", () => {
    const db = makeDb();
    const svc = new AuditService(db);
    svc.appendPre({ ts: 100, threadId: "A", toolName: "Bash", toolUseId: "u1", input: {}, cwd: "/" });
    svc.appendPre({ ts: 200, threadId: "B", toolName: "Read", toolUseId: "u2", input: {}, cwd: "/" });
    svc.appendPre({ ts: 300, threadId: "A", toolName: "Edit", toolUseId: "u3", input: {}, cwd: "/" });
    const rows = svc.queryByThread("A", 10);
    expect(rows.map((r) => r.toolName)).toEqual(["Edit", "Bash"]);
  });
});
