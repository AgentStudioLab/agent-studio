// 历史消息归一化 + 工具调用残留清扫。
// 都是纯函数，方便单测。

import { nanoid } from "nanoid";
import type { MessageBlock, MessageView, SideEffectFile, ToolCallView } from "./types";

/**
 * 把字符串安全地解析成 JSON。失败时原样返回，不抛错。
 * 流式 args 可能在中途解析失败 —— 保留原始 buffer 让上游决定。
 */
function safeJson(s: unknown): unknown {
  if (typeof s !== "string") return s;
  if (!s.trim()) return {};
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

function parseSideEffects(v: unknown): SideEffectFile[] | null {
  if (!Array.isArray(v)) return null;
  const out: SideEffectFile[] = [];
  for (const item of v) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    if (typeof o.path !== "string") continue;
    if (o.kind !== "created" && o.kind !== "modified") continue;
    out.push({ path: o.path, kind: o.kind });
  }
  return out.length > 0 ? out : null;
}

/**
 * run 结束后，把仍然 pending 的工具调用统一改为 success。
 *
 * 为什么需要：TOOL_CALL_RESULT 可能因为各种原因没到达客户端
 * （取消、网络抖动、deepagents 内部工具不发 on_tool_end 等），
 * 没有这步清扫，UI 上的 spinner 会永远转。
 *
 * 注意：result 保持为 null，我们不伪造工具输出，只是停止旋转。
 */
export function sweepPendingToolCalls(messages: MessageView[]): MessageView[] {
  return messages.map((m) => {
    if (m.role !== "assistant") return m;
    let dirty = false;
    const nextBlocks = m.blocks.map((b) => {
      if (b.kind === "tool_call" && b.toolCall.status === "pending") {
        dirty = true;
        return {
          ...b,
          toolCall: { ...b.toolCall, status: "success" as const },
        };
      }
      return b;
    });
    return dirty ? { ...m, blocks: nextBlocks } : m;
  });
}

/**
 * 把服务端 /threads/:id/messages 返回的 TurnDTO[] 翻译成视图层 MessageView[]。
 *
 * 服务端已经做了 turn 归并（连续 AIMessage 折叠成一个 assistant 回合），
 * 这里基本是直传，只补几个兼容点：
 *   - 缺 id 时用 nanoid 补一个
 *   - tool_call.args 可能是字符串，过一道 safeJson
 *   - 兼容只有部分字段的旧数据
 */
export function buildViewMessages(raw: unknown[]): MessageView[] {
  type AnyTurn = {
    id?: string;
    role?: string;
    content?: string;
    blocks?: AnyBlock[];
  };
  type AnyBlock =
    | { kind: "text"; id?: string; content?: string }
    | { kind: "reasoning"; id?: string; content?: string }
    | { kind: "tool_call"; toolCall?: Record<string, unknown> }
    | { kind: "notice"; id?: string; level?: string; content?: string; reason?: string };
  const list = (raw ?? []) as AnyTurn[];

  const out: MessageView[] = [];
  for (const t of list) {
    if (t.role === "user") {
      out.push({
        id: t.id ?? `msg_${nanoid(10)}`,
        role: "user",
        content: t.content ?? "",
      });
      continue;
    }
    if (t.role !== "assistant") continue;

    const blocks: MessageBlock[] = [];
    for (const b of t.blocks ?? []) {
      if (b.kind === "text") {
        blocks.push({
          kind: "text",
          id: b.id ?? `txt_${nanoid(8)}`,
          content: b.content ?? "",
        });
      } else if (b.kind === "reasoning") {
        blocks.push({
          kind: "reasoning",
          id: b.id ?? `rsn_${nanoid(8)}`,
          content: b.content ?? "",
        });
      } else if (b.kind === "tool_call" && b.toolCall) {
        const tc = b.toolCall as Record<string, unknown>;
        const toolCall: ToolCallView = {
          id: String(tc.id ?? ""),
          toolName: String(tc.toolName ?? ""),
          args: safeJson(tc.args),
          result: tc.result ?? null,
          status: (tc.status as ToolCallView["status"]) ?? "pending",
          errorMsg: tc.errorMsg as string | undefined,
        };
        const effects = parseSideEffects(tc.sideEffects);
        if (effects) toolCall.sideEffects = effects;
        blocks.push({ kind: "tool_call", toolCall });
      } else if (b.kind === "notice") {
        blocks.push({
          kind: "notice",
          id: b.id ?? `notice_${nanoid(8)}`,
          level: "interrupted",
          content: b.content ?? "",
          ...(b.reason === "process_restart" || b.reason === "user"
            ? { reason: b.reason }
            : {}),
        });
      }
    }

    out.push({
      id: t.id ?? `msg_${nanoid(10)}`,
      role: "assistant",
      blocks,
    });
  }
  return out;
}
