// Covers the `[reason]` content-prefix → notice.reason parser inside
// groupIntoTurns. The frontend uses notice.reason === "process_restart" to
// render the "继续上次任务" CTA after the user reopens an app whose HITL
// approval was pending at exit.

import { describe, expect, it } from "bun:test";
import { groupIntoTurns, type MessageDTO } from "./messages";

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
      row("system", "[process_restart] 上次审批未完成时应用被关闭，agent 已停止"),
    ]);
    const assistant = turns.find((t) => t.role === "assistant");
    if (!assistant || assistant.role !== "assistant") throw new Error("expected assistant turn");
    const notice = assistant.blocks.find((b) => b.kind === "notice");
    if (!notice || notice.kind !== "notice") throw new Error("expected notice block");
    expect(notice.reason).toBe("process_restart");
    expect(notice.content).toBe("上次审批未完成时应用被关闭，agent 已停止");
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
