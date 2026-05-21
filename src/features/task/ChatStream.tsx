import { isValidElement, useCallback, useMemo, type ReactNode } from "react";
import { Streamdown } from "streamdown";
import type { BundledLanguage } from "shiki";
import type { MessageBlock, MessageView, PendingInterrupt } from "@/lib/agui/runtime";
import { ToolApprovalCard } from "@/features/task/ToolApprovalCard";
import { UserMessage } from "@/features/task/UserMessage";
import { MessageActions } from "@/features/task/MessageActions";
import {
  ProcessGroup,
  type ProcessStep,
} from "@/features/task/ProcessGroup";
import { ThinkingSpinner } from "@/shared/atoms/ThinkingSpinner";
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from "@/components/ai-elements/code-block";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";

interface ChatStreamProps {
  threadId: string;
  messages: MessageView[];
  isThinking: boolean;
  isRunning: boolean;
  error: string | null;
  loading?: boolean;
  pendingInterrupts: PendingInterrupt[];
  onResume: (payload: {
    decisions: Array<
      | { type: "allow" }
      | { type: "deny"; message?: string }
    >;
  }) => Promise<void>;
  allowedTools: ReadonlySet<string>;
  onAllowAlways: (toolName: string) => void;
}

/**
 * Streamdown component overrides: replace the built-in code block renderer
 * with the project's CodeBlock (shiki + GitHub themes + copy button) so the
 * code visuals match the rest of the chat surface.
 *
 * The `pre` element wraps a `<code className="language-foo">` node — we pull
 * out the language + raw text and forward to <CodeBlock>.
 */
function MarkdownCodeBlock({
  children,
}: {
  children?: ReactNode;
}): ReactNode {
  let className = "";
  let code = "";
  if (isValidElement<{ className?: string; children?: ReactNode }>(children)) {
    className = children.props.className ?? "";
    code = String(children.props.children ?? "").replace(/\n$/, "");
  } else if (typeof children === "string") {
    code = children;
  }
  const lang = (/language-([\w-]+)/.exec(className)?.[1] ?? "text") as
    | BundledLanguage
    | "text";
  return (
    <CodeBlock
      code={code}
      language={lang as BundledLanguage}
      className="my-3"
    >
      <CodeBlockHeader>
        <CodeBlockTitle>
          <CodeBlockFilename>{lang}</CodeBlockFilename>
        </CodeBlockTitle>
        <CodeBlockActions>
          <CodeBlockCopyButton />
        </CodeBlockActions>
      </CodeBlockHeader>
    </CodeBlock>
  );
}

const STREAMDOWN_COMPONENTS = {
  pre: MarkdownCodeBlock,
};

/**
 * Chat transcript per Showcase 1 prototype.
 *
 * Streaming UX contract:
 *   - MessageActions toolbar only shows on COMPLETED assistant turns. The
 *     live last assistant turn during isRunning is footer-less so the user
 *     doesn't try to copy a half-formed answer.
 *   - "Thinking…" bottom row uses <ThinkingSpinner> (SpriteLoader chase),
 *     not a plain text label.
 *   - Code fences inside Streamdown markdown render via the project's
 *     CodeBlock primitive (consistent shiki + theme + copy treatment).
 */
export function ChatStream({
  threadId,
  messages,
  isThinking,
  isRunning,
  error,
  loading = false,
  pendingInterrupts,
  onResume,
  allowedTools,
  onAllowAlways,
}: ChatStreamProps) {
  const interruptsByToolId = useMemo(() => {
    const m = new Map<string, PendingInterrupt>();
    for (const it of pendingInterrupts) {
      const tn = (it.payload as { toolName?: string }).toolName;
      if (tn && allowedTools.has(tn)) continue;
      m.set(it.id, it);
    }
    return m;
  }, [pendingInterrupts, allowedTools]);

  const renderApprovalCard = useCallback(
    (it: PendingInterrupt) => (
      <ToolApprovalCard
        key={it.id}
        interrupt={it}
        onAllow={() => void onResume({ decisions: [{ type: "allow" }] })}
        onDeny={(reason) => void onResume({ decisions: [{ type: "deny", message: reason }] })}
        onAllowAlways={onAllowAlways}
      />
    ),
    [onResume, onAllowAlways],
  );

  const orphanInterrupts = useMemo(() => {
    const matchedIds = new Set<string>();
    for (const m of messages) {
      if (m.role !== "assistant") continue;
      for (const b of m.blocks) {
        if (b.kind === "tool_call") matchedIds.add(b.toolCall.id);
      }
    }
    return [...interruptsByToolId.values()].filter((it) => !matchedIds.has(it.id));
  }, [messages, interruptsByToolId]);

  if (loading) {
    return (
      <div className="flex-1 px-8 py-6 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  // `key={threadId}` re-mounts the StickToBottom container when the user
  // switches conversations so `initial="instant"` snaps to the bottom of the
  // new thread (otherwise the container stays mounted across switches and
  // initial only runs once). During streaming, resize="smooth" + ResizeObserver
  // keeps the view glued to the bottom unless the user scrolls up.
  return (
    <Conversation
      key={threadId}
      initial="instant"
      resize="smooth"
      className="flex-1"
    >
      <ConversationContent className="gap-0 p-0">
        <div className="mx-auto w-full max-w-[760px] space-y-6 px-8 py-6">
          {messages.map((m, idx) => {
            const isLive =
              isRunning &&
              m.role === "assistant" &&
              idx === messages.length - 1;
            return (
              <MessageRow
                key={m.id}
                message={m}
                showActions={!isLive}
                interruptsByToolId={interruptsByToolId}
                renderApprovalCard={renderApprovalCard}
              />
            );
          })}
          {isRunning && isThinking && (
            <div
              className="flex items-center gap-2 text-[13px]"
              style={{ color: "hsl(var(--text-300))" }}
            >
              <ThinkingSpinner size={16} />
              <span>思考中</span>
            </div>
          )}
          {error && (
            <p className="text-[13px]" style={{ color: "hsl(var(--danger-100))" }}>
              错误：{error}
            </p>
          )}
          {orphanInterrupts.map(renderApprovalCard)}
        </div>
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}

/* ---------------- block grouping ---------------- */

/**
 * Virtual block produced by `groupBlocks` — a run of consecutive process
 * steps (reasoning + tool_call) collapsed into one timeline group. `done`
 * is true iff a `text` (or `notice`) block follows; that triggers
 * auto-collapse + ✓Done. Trailing process group stays `done: false` (live).
 */
type GroupedBlock =
  | Extract<MessageBlock, { kind: "text" } | { kind: "notice" }>
  | {
      kind: "process_group";
      key: string;
      steps: ProcessStep[];
      done: boolean;
    };

function groupBlocks(blocks: MessageBlock[]): GroupedBlock[] {
  const out: GroupedBlock[] = [];
  let pending: ProcessStep[] = [];

  const flush = (done: boolean) => {
    if (pending.length === 0) return;
    const first = pending[0]!;
    const key =
      first.kind === "reasoning" ? `pg_r_${first.id}` : `pg_t_${first.tool.id}`;
    out.push({ kind: "process_group", key, steps: pending, done });
    pending = [];
  };

  for (const b of blocks) {
    if (b.kind === "reasoning") {
      pending.push({ kind: "reasoning", id: b.id, content: b.content });
      continue;
    }
    if (b.kind === "tool_call") {
      pending.push({ kind: "tool_call", tool: b.toolCall });
      continue;
    }
    flush(true);
    out.push(b);
  }
  flush(false);
  return out;
}

function MessageRow({
  message,
  showActions,
  interruptsByToolId,
  renderApprovalCard,
}: {
  message: MessageView;
  showActions: boolean;
  interruptsByToolId: Map<string, PendingInterrupt>;
  renderApprovalCard: (it: PendingInterrupt) => ReactNode;
}) {
  if (message.role === "user") {
    return <UserMessage>{message.content}</UserMessage>;
  }

  const grouped = groupBlocks(message.blocks);

  return (
    <div className="space-y-3">
      {grouped.map((b, i) => {
        if (b.kind === "process_group") {
          let matchingInterrupt: PendingInterrupt | undefined;
          for (const s of b.steps) {
            if (s.kind !== "tool_call") continue;
            const it = interruptsByToolId.get(s.tool.id);
            if (it) { matchingInterrupt = it; break; }
          }
          return (
            <div key={b.key} className="space-y-3">
              <ProcessGroup steps={b.steps} done={b.done} />
              {matchingInterrupt && renderApprovalCard(matchingInterrupt)}
            </div>
          );
        }
        if (b.kind === "text") {
          return (
            <div
              key={`${b.id}-${i}`}
              className="prose-stream text-[14px] leading-[1.75]"
              style={{ color: "hsl(var(--text-100))" }}
            >
              <Streamdown
                mode="streaming"
                parseIncompleteMarkdown
                components={STREAMDOWN_COMPONENTS}
              >
                {b.content}
              </Streamdown>
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
      {showActions && <MessageActions />}
    </div>
  );
}
