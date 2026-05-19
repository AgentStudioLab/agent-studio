import { describe, it, expect } from "bun:test";
import { encodeSseFrame } from "../../src/lib/sse";

describe("encodeSseFrame", () => {
  it("encodes event + data on simple payload", () => {
    const frame = encodeSseFrame("text-delta", { messageId: "m1", text: "hi" });
    expect(frame).toBe(`event: text-delta\ndata: {"messageId":"m1","text":"hi"}\n\n`);
  });

  it("escapes newlines inside data (SSE spec splits on \\n)", () => {
    const frame = encodeSseFrame("text-delta", { text: "line1\nline2" });
    // JSON.stringify 已经把 \n 转义为 \\n，所以序列化后的 data 行不含真实换行
    expect(frame).not.toContain("line1\nline2");
    expect(frame).toContain("line1\\nline2");
  });

  it("appends terminator \\n\\n exactly once", () => {
    const frame = encodeSseFrame("message-stop", { messageId: "m1", finishReason: "end_turn" });
    expect(frame.endsWith("\n\n")).toBe(true);
    expect(frame.endsWith("\n\n\n")).toBe(false);
  });
});
