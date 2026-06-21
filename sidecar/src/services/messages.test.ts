// 覆盖：
//   1. groupIntoTurns 内部的 `[reason]` 内容前缀 → notice.reason 解析。前端依赖
//      notice.reason === "process_restart" 在重启后给等待用户的中断展示继续入口。
//   2. tool_calls.side_effects 往返：completeToolCall 写 JSON 列，listByThread
//      读回 ToolCallDTO.sideEffects。否则 Bash 产物会在刷新线程后从 Files Tab 消失。

import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { groupIntoTurns, MessageService, type MessageDTO } from "./messages";
import { migrate } from "../db";

function row(
  role: MessageDTO["role"],
  content: string,
  id = `m_${Math.random().toString(36).slice(2, 8)}`,
): MessageDTO {
  return {
    id,
    threadId: "t1",
    role,
    content,
    createdAt: Date.now(),
  };
}

describe("groupIntoTurns — notice reason parsing", () => {
  it("extracts process_restart prefix and strips it from display content", () => {
    const turns = groupIntoTurns([
      row("user", "do a thing"),
      row("assistant", "ok"),
      row("system", "[process_restart] 上次等待用户时应用被关闭，agent 已停止"),
    ]);
    const assistant = turns.find((t) => t.role === "assistant");
    if (!assistant || assistant.role !== "assistant") throw new Error("expected assistant turn");
    const notice = assistant.blocks.find((b) => b.kind === "notice");
    if (!notice || notice.kind !== "notice") throw new Error("expected notice block");
    expect(notice.reason).toBe("process_restart");
    expect(notice.content).toBe("上次等待用户时应用被关闭，agent 已停止");
  });

  it("leaves legacy plain content unchanged (reason undefined)", () => {
    const turns = groupIntoTurns([
      row("user", "do it"),
      row("assistant", "ok"),
      row("system", "已被用户中止"),
    ]);
    const assistant = turns.find((t) => t.role === "assistant");
    if (!assistant || assistant.role !== "assistant") throw new Error("expected assistant turn");
    const notice = assistant.blocks.find((b) => b.kind === "notice");
    if (!notice || notice.kind !== "notice") throw new Error("expected notice block");
    expect(notice.reason).toBeUndefined();
    expect(notice.content).toBe("已被用户中止");
  });
});

describe("MessageService — side_effects round-trip", () => {
  function setupDb(): { db: Database; svc: MessageService } {
    const db = new Database(":memory:");
    migrate(db);
    db.prepare(
      `INSERT INTO conversations (id, title, created_at, updated_at)
       VALUES ('t1', 'test', ?, ?)`,
    ).run(Date.now(), Date.now());
    return { db, svc: new MessageService(db) };
  }

  it("persists sideEffects to tool_calls.side_effects and parses on read", () => {
    const { svc } = setupDb();
    svc.appendUser("t1", "make a pptx");
    const a = svc.appendAssistant("t1", { id: "m_a", content: "" });
    svc.upsertToolCall(a.id, { id: "tc_1", toolName: "Bash", args: { command: "python make.py" } });
    svc.completeToolCall("tc_1", {
      result: "ok",
      status: "success",
      sideEffects: [
        { path: "/tmp/work/deck.pptx", kind: "created" },
        { path: "/tmp/work/notes.md", kind: "modified" },
      ],
    });

    const rows = svc.listByThread("t1");
    const assistant = rows.find((r) => r.role === "assistant");
    if (!assistant) throw new Error("expected assistant message");
    const tc = assistant.toolCalls?.[0];
    if (!tc) throw new Error("expected tool call");
    expect(tc.sideEffects).toEqual([
      { path: "/tmp/work/deck.pptx", kind: "created" },
      { path: "/tmp/work/notes.md", kind: "modified" },
    ]);
  });

  it("leaves sideEffects undefined when none were detected", () => {
    const { svc } = setupDb();
    svc.appendUser("t1", "echo hi");
    const a = svc.appendAssistant("t1", { id: "m_a", content: "" });
    svc.upsertToolCall(a.id, { id: "tc_1", toolName: "Bash", args: { command: "echo hi" } });
    svc.completeToolCall("tc_1", { result: "hi", status: "success" });

    const rows = svc.listByThread("t1");
    const tc = rows.find((r) => r.role === "assistant")?.toolCalls?.[0];
    expect(tc?.sideEffects).toBeUndefined();
  });

  it("survives malformed JSON in the column (returns undefined, not crash)", () => {
    const { db, svc } = setupDb();
    svc.appendUser("t1", "x");
    const a = svc.appendAssistant("t1", { id: "m_a", content: "" });
    svc.upsertToolCall(a.id, { id: "tc_1", toolName: "Bash", args: {} });
    svc.completeToolCall("tc_1", { result: null, status: "success" });
    // Manually corrupt the column to simulate a legacy / partial write.
    db.prepare(`UPDATE tool_calls SET side_effects = '{not json' WHERE id = ?`).run("tc_1");

    const rows = svc.listByThread("t1");
    const tc = rows.find((r) => r.role === "assistant")?.toolCalls?.[0];
    expect(tc?.sideEffects).toBeUndefined();
  });
});
