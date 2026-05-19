import type { Message } from "@/lib/data/types";

interface StreamState {
  status: "streaming" | "done" | "aborted" | "error";
  textBuffer: string;
  messageId: string | null;
  errorMessage?: string;
}

interface ChatStreamProps {
  messages: Message[];
  stream: StreamState | null;
  loading: boolean;
}

export function ChatStream({ messages, stream, loading }: ChatStreamProps) {
  if (loading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }
  return (
    <div className="flex-1 overflow-y-auto px-12 py-6">
      {messages.map((m) => (
        <MessageRow key={m.id} message={m} />
      ))}
      {stream && stream.status === "streaming" && (
        <MessageRow
          message={{
            id: "in-flight",
            conversationId: "",
            role: "assistant",
            blocks: [{ type: "text", text: stream.textBuffer }],
            createdAt: Date.now(),
            finishReason: null,
            errorText: null,
          }}
          streaming
        />
      )}
      {stream && stream.status === "aborted" && (
        <p className="mt-2 text-sm" style={{ color: "hsl(var(--text-300))" }}>
          已停止
        </p>
      )}
      {stream && stream.status === "error" && (
        <p className="mt-2 text-sm" style={{ color: "hsl(var(--danger-100))" }}>
          错误：{stream.errorMessage}
        </p>
      )}
    </div>
  );
}

function MessageRow({
  message,
  streaming = false,
}: {
  message: Message;
  streaming?: boolean;
}) {
  // spec §6.4 resumption：DB 加载时 finish_reason=null 表示"残留 in-flight"（sidecar 崩溃 / 应用重启）。
  // finish_reason="error" 表示流过程中出错。两种情况都在消息末尾渲染状态尾标 + Resend。
  const interrupted =
    message.role === "assistant" && !streaming && message.finishReason === null;
  const failed = message.role === "assistant" && message.finishReason === "error";
  const aborted = message.role === "assistant" && message.finishReason === "aborted";

  return (
    <div className="mb-6">
      <div className="mb-2 text-xs uppercase text-muted-foreground">
        {message.role === "user" ? "You" : "Claude"}
      </div>
      {message.blocks.map((b, i) => (
        <p key={i} className="text-sm text-foreground">
          {b.type === "text" ? b.text : null}
          {streaming && i === message.blocks.length - 1 && (
            <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-current" />
          )}
        </p>
      ))}
      {(interrupted || failed || aborted) && (
        <p className="mt-2 text-xs" style={{ color: "hsl(var(--text-300))" }}>
          {interrupted && "已中断"}
          {aborted && "已停止"}
          {failed && `失败：${message.errorText ?? "unknown"}`}
          {" · "}
          {/* Resend handler wired in a later wave */}
          <button className="underline" type="button">
            Resend
          </button>
        </p>
      )}
    </div>
  );
}
