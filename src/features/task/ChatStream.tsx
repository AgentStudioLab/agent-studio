import { isValidElement, useCallback, useMemo, type ReactNode } from "react";
import { Streamdown } from "streamdown";
import type { BundledLanguage } from "shiki";
import type { MessageBlock, MessageView, PendingInterrupt } from "@/lib/agui/runtime";
import type { ChatRuntime } from "@/lib/agui/runtime/runtime";
import { useRunStatus } from "@/lib/agui/react/useRunStatus";
import { useNavigate } from "react-router-dom";
import { ToolApprovalCard } from "@/features/task/ToolApprovalCard";
import { UserMessage } from "@/features/task/UserMessage";
import { MessageActions } from "@/features/task/MessageActions";
import { ApiKeyMissingBanner } from "@/features/task/ApiKeyMissingBanner";
import { RetryHint } from "@/features/task/RetryHint";
import { RetryingPill } from "@/features/task/RetryingPill";
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
  runtime: ChatRuntime;
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
  /**
   * Called when the user clicks "继续上次任务" on a process_restart notice.
   * Sends a follow-up prompt that resumes the previously interrupted turn —
   * the SDK session id replays the prior context so the agent picks up where
   * it left off.
   */
  onContinueAfterRestart: () => void;
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
  runtime,
  messages,
  isThinking,
  isRunning,
  error,
  loading = false,
  pendingInterrupts,
  onResume,
  allowedTools,
  onAllowAlways,
  onContinueAfterRestart,
}: ChatStreamProps) {
  const navigate = useNavigate();
  // cast: ChatRuntime.subscribe takes (state) => void; RuntimeLike expects () => void.
  // The wrapper in useRunStatus discards the state arg, so this is safe at runtime.
  const status = useRunStatus(runtime as never);
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
          {status.isAuthError && (
            <ApiKeyMissingBanner onConfigureClick={() => navigate("/settings")} />
          )}
          {status.errorCode === "RATE_LIMIT" && status.retry && (
            <RetryHint delayMs={status.retry.retryDelayMs} />
          )}
          {status.retry && status.status === "running" && (
            <div className="px-4 pt-2">
              <RetryingPill attempt={status.retry.attempt} maxRetries={status.retry.maxRetries} />
            </div>
          )}
          {messages.map((m, idx) => {
            const isLive =
              isRunning &&
              m.role === "assistant" &&
              idx === messages.length - 1;
            const isLastMessage = idx === messages.length - 1;
            return (
              <MessageRow
                key={m.id}
                message={m}
                showActions={!isLive}
                isLastMessage={isLastMessage}
                interruptsByToolId={interruptsByToolId}
                renderApprovalCard={renderApprovalCard}
                onContinueAfterRestart={onContinueAfterRestart}
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
  isLastMessage,
  interruptsByToolId,
  renderApprovalCard,
  onContinueAfterRestart,
}: {
  message: MessageView;
  showActions: boolean;
  isLastMessage: boolean;
  interruptsByToolId: Map<string, PendingInterrupt>;
  renderApprovalCard: (it: PendingInterrupt) => ReactNode;
  onContinueAfterRestart: () => void;
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
          // "继续上次任务" CTA only on the last message AND last block of that
          // message. Once the user has sent a new prompt (or the notice was
          // followed by any further content), the recovery opportunity has
          // passed — leaving the button visible mid-history would invite
          // duplicate sends + confuse the reading flow.
          const isLastBlock = i === grouped.length - 1;
          const showContinueCta =
            b.reason === "process_restart" && isLastMessage && isLastBlock;
          return (
            <div
              key={`${b.id}-${i}`}
              className="flex flex-wrap items-center gap-2 text-[12.5px]"
              style={{ color: "hsl(var(--text-300))" }}
            >
              <span>{b.content}</span>
              {showContinueCta && (
                <button
                  type="button"
                  onClick={onContinueAfterRestart}
                  className="rounded-md border px-2 py-0.5 text-[12px] transition-colors"
                  style={{
                    borderColor: "hsl(var(--brand-100) / 0.5)",
                    color: "hsl(var(--brand-100))",
                  }}
                >
                  继续上次任务
                </button>
              )}
            </div>
          );
        }
        return null;
      })}
      {showActions && <MessageActions />}
    </div>
  );
}
