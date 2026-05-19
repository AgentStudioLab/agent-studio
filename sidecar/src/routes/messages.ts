import { Hono } from "hono";
import type { Database } from "bun:sqlite";
import {
  getConversation,
  getMessages,
  insertAssistantMessage,
} from "../services/conversations";
import { aggregateBlocks, query, translateEvents } from "../services/agent";
import { encodeSseFrame, type SseEvent } from "../lib/sse";
import { ulid } from "../lib/ulid";
import type { ApiKeyState } from "../services/apiKey";

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const validateId = (id: string) => ULID_RE.test(id);

export function buildMessageRoutes(db: Database, apiKey: ApiKeyState): Hono {
  const app = new Hono();

  /** conversationId → AbortController. v1 内唯一允许的跨请求内存状态。 */
  const inflight = new Map<string, AbortController>();

  app.post("/conversations/:id/messages", async (c) => {
    const id = c.req.param("id");
    if (!validateId(id)) return c.json({ error: "invalid_id" }, 400);
    const conv = getConversation(db, id);
    if (!conv) return c.json({ error: "not_found" }, 404);

    if (inflight.has(id)) return c.json({ error: "turn_in_progress" }, 409);

    const key = apiKey.get();
    if (!key) return c.json({ error: "api_key_missing" }, 400);

    const body = (await c.req.json().catch(() => null)) as { text?: string } | null;
    if (!body?.text || typeof body.text !== "string") {
      return c.json({ error: "text_required" }, 400);
    }

    // 写 user 消息（同 createConversation 的逻辑分支：当 conversation 已存在但要追加 turn 时调用）
    // 注意：当前 NewTaskView 流走 createConversation 已经写过首条 user 消息。
    // 本路由：仅当 latest 不是 user-with-text 时插入；否则跳过避免重复。
    const msgs = getMessages(db, id);
    const last = msgs.at(-1);
    if (!last || last.role !== "user") {
      const uid = ulid();
      const now = Date.now();
      db.prepare(
        `INSERT INTO messages (id, conversation_id, role, blocks_json, created_at, finish_reason, error_text)
         VALUES (?, ?, 'user', ?, ?, 'end_turn', NULL)`,
      ).run(uid, id, JSON.stringify([{ type: "text", text: body.text }]), now);
    }

    const controller = new AbortController();
    inflight.set(id, controller);

    const messageId = ulid();
    const allMessages = getMessages(db, id);

    return new Response(
      new ReadableStream<Uint8Array>({
        async start(stream) {
          const encoder = new TextEncoder();
          const collected: SseEvent[] = [];

          try {
            const rawIter = query({
              messages: allMessages,
              apiKey: key,
              signal: controller.signal,
            });
            for await (const ev of translateEvents(rawIter, { messageId })) {
              collected.push(ev);
              stream.enqueue(encoder.encode(encodeSseFrame(ev.event, ev.data)));
            }
          } catch (e) {
            const err: SseEvent = {
              event: "error",
              data: {
                code: "agent_error",
                message: e instanceof Error ? e.message : String(e),
              },
            };
            collected.push(err);
            stream.enqueue(encoder.encode(encodeSseFrame(err.event, err.data)));
          } finally {
            const finishEvent = collected.at(-1);
            const finishReason =
              finishEvent?.event === "message-stop"
                ? "end_turn"
                : finishEvent?.event === "aborted"
                  ? "aborted"
                  : "error";
            const errorText =
              finishEvent?.event === "error"
                ? (finishEvent.data as { message: string }).message
                : null;
            insertAssistantMessage(db, id, {
              blocks: aggregateBlocks(collected),
              finishReason,
              errorText,
            });
            inflight.delete(id);
            stream.close();
          }
        },
        cancel() {
          controller.abort();
        },
      }),
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      },
    );
  });

  app.post("/conversations/:id/abort", (c) => {
    const id = c.req.param("id");
    if (!validateId(id)) return c.json({ error: "invalid_id" }, 400);
    const ctrl = inflight.get(id);
    if (!ctrl) return c.json({ error: "not_in_flight" }, 404);
    ctrl.abort();
    return c.json({ ok: true });
  });

  return app;
}
