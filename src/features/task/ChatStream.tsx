import { Streamdown } from "streamdown";
import type { MessageView } from "@/lib/agui/runtime";

interface ChatStreamProps {
  messages: MessageView[];
  isThinking: boolean;
  error: string | null;
  loading?: boolean;
}

/**
 * Chat transcript layout per Showcase 1 prototype (Claude Desktop / Cowork):
 *   - user msg: right-aligned bubble, max-w 78%, bg-bg-300
 *   - assistant msg: full-width text content, no "CLAUDE" label
 *   - column max-w 760px centered, generous vertical spacing between turns
 *
 * Tool-call cards / artifact cards / preset questions land in this column too
 * (each rendered by an assistant block kind); we keep the per-block dispatch
 * minimal here and let future blocks add their own component.
 */
export function ChatStream({
  messages,
  isThinking,
  error,
  loading = false,
}: ChatStreamProps) {
  if (loading) {
    return (
      <div className="flex-1 px-8 py-6 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[760px] space-y-6 px-8 py-6">
        {messages.map((m) => (
          <MessageRow key={m.id} message={m} />
        ))}
        {isThinking && (
          <p className="text-[13px]" style={{ color: "hsl(var(--text-300))" }}>
            思考中…
          </p>
        )}
        {error && (
          <p className="text-[13px]" style={{ color: "hsl(var(--danger-100))" }}>
            错误：{error}
          </p>
        )}
      </div>
    </div>
  );
}

function MessageRow({ message }: { message: MessageView }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[78%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed"
          style={{
            background: "hsl(var(--bg-300))",
            color: "hsl(var(--text-100))",
          }}
        >
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {message.blocks.map((b, i) => {
        if (b.kind === "text") {
          // streamdown renders markdown progressively (handles half-open
          // fences / lists / inline as deltas land) and ships its own CSS
          // primitives. mode="streaming" enables incomplete-markdown patching.
          return (
            <div
              key={`${b.id}-${i}`}
              className="prose-stream text-[14px] leading-[1.75]"
              style={{ color: "hsl(var(--text-100))" }}
            >
              <Streamdown mode="streaming" parseIncompleteMarkdown>
                {b.content}
              </Streamdown>
            </div>
          );
        }
        if (b.kind === "reasoning") {
          return (
            <div
              key={`${b.id}-${i}`}
              className="whitespace-pre-wrap text-[13px] leading-[1.7]"
              style={{ color: "hsl(var(--text-300))" }}
            >
              {b.content}
            </div>
          );
        }
        if (b.kind === "tool_call") {
          const tc = b.toolCall;
          return (
            <div
              key={tc.id}
              className="rounded-lg px-3 py-2 text-[12.5px]"
              style={{
                border: "1px solid hsl(var(--border-300) / 0.18)",
                color: "hsl(var(--text-300))",
              }}
            >
              <div
                className="text-[13px] font-medium"
                style={{ color: "hsl(var(--text-100))" }}
              >
                {tc.toolName}
              </div>
              <div className="mt-0.5 text-[11.5px] opacity-70">
                status: {tc.status}
              </div>
            </div>
          );
        }
        if (b.kind === "notice") {
          return (
            <p
              key={`${b.id}-${i}`}
              className="text-[12.5px]"
              style={{ color: "hsl(var(--text-300))" }}
            >
              {b.content}
            </p>
          );
        }
        return null;
      })}
    </div>
  );
}
