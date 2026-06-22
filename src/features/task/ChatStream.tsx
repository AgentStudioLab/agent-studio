import { useCallback, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Streamdown } from "streamdown";
import type {
  MessageBlock,
  MessageView,
  PendingInterrupt,
  ToolCallView,
} from "@/lib/agui/runtime";
import type { ChatRuntime } from "@/lib/agui/runtime/runtime";
import {
  ArtifactInlineCard,
  type ArtifactKind,
} from "@/features/task/ArtifactInlineCard";
import { useRunStatus } from "@/lib/agui/react/useRunStatus";
import { useNavigate } from "react-router-dom";
import { ToolApprovalCard } from "@/features/task/ToolApprovalCard";
import { AskUserCard } from "@/features/task/ask-user/AskUserCard";
import type {
  AskUserAnswersDecision,
  AskUserPayload,
} from "@/features/task/ask-user/types";
import { UserMessage } from "@/features/task/UserMessage";
import { MessageActions } from "@/features/task/MessageActions";
import { ApiKeyMissingBanner } from "@/features/task/ApiKeyMissingBanner";
import { RetryHint } from "@/features/task/RetryHint";
import { RetryingPill } from "@/features/task/RetryingPill";
import { ProcessGroup, type ProcessStep } from "@/features/task/ProcessGroup";
import { ThinkingSpinner } from "@/shared/atoms/ThinkingSpinner";
import {
  STREAMDOWN_MARKDOWN_COMPONENTS,
  STREAMDOWN_PLUGINS,
} from "@/shared/markdown/streamdownPlugins";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { getWebsiteOrigin } from "@/features/auth/desktop-auth-client";
import { isTaskTrackingToolName } from "@/features/task/taskTrackingTools";

/* ---------------- artifact helpers ---------------- */

interface ArtifactInfo {
  absolutePath: string;
  name: string;
  kind: ArtifactKind;
  ext: string;
}

const MUTATION_TOOL_NAMES: ReadonlySet<string> = new Set([
  "Write",
  "Edit",
  "MultiEdit",
  "NotebookEdit",
]);

const ARTIFACT_EXTENSIONS: ReadonlySet<string> = new Set([
  "md",
  "markdown",
  "txt",
  "rtf",
  "pdf",
  "docx",
  "doc",
  "pptx",
  "ppt",
  "key",
  "xlsx",
  "xls",
  "csv",
  "tsv",
  "ods",
  "json",
  "yaml",
  "yml",
  "toml",
  "xml",
  "html",
  "htm",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "svg",
  "webp",
  "bmp",
  "ico",
  "zip",
  "tar",
  "gz",
  "tgz",
  "ipynb",
]);

function isArtifactPath(p: string): boolean {
  const name = basename(p);
  const dotIdx = name.lastIndexOf(".");
  if (dotIdx <= 0) return false;
  return ARTIFACT_EXTENSIONS.has(name.slice(dotIdx + 1).toLowerCase());
}

function basename(p: string): string {
  const trimmed = p.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

function extensionOf(p: string): string {
  const name = basename(p);
  const idx = name.lastIndexOf(".");
  if (idx <= 0) return "";
  return name.slice(idx + 1).toUpperCase();
}

function kindForExt(ext: string): ArtifactKind {
  if (ext === "XLSX" || ext === "CSV") return "Spreadsheet";
  if (ext === "PPTX" || ext === "KEY") return "Presentation";
  return "Document";
}

function extractMutationPath(tool: ToolCallView): string | null {
  if (!MUTATION_TOOL_NAMES.has(tool.toolName)) return null;
  if (tool.status !== "success") return null;
  const args = tool.args;
  if (typeof args !== "object" || args === null) return null;
  const o = args as Record<string, unknown>;
  if (tool.toolName === "NotebookEdit") {
    return typeof o.notebook_path === "string" ? o.notebook_path : null;
  }
  return typeof o.file_path === "string" ? o.file_path : null;
}

/**
 * Walk the assistant turn's tool_call blocks, return one ArtifactInfo per
 * unique absolute path written/edited in cwd (deduped, in first-seen order).
 * Includes files from Bash sideEffects (indirect file creation/modification).
 * Files whose extension is not in the artifact whitelist are hidden — scripts
 * and source code (.py / .sh / .ts / etc) are internal tooling, not deliverables.
 */
function mutationToolCallsToArtifacts(
  blocks: MessageBlock[],
  workingDir: string | null,
): ArtifactInfo[] {
  if (!workingDir) return [];
  const cwdPrefix = workingDir.endsWith("/") ? workingDir : workingDir + "/";
  const seen = new Set<string>();
  const out: ArtifactInfo[] = [];

  function pushIfArtifact(path: string) {
    if (path !== workingDir && !path.startsWith(cwdPrefix)) return;
    if (!isArtifactPath(path)) return;
    if (seen.has(path)) return;
    seen.add(path);
    const ext = extensionOf(path);
    out.push({
      absolutePath: path,
      name: basename(path),
      kind: kindForExt(ext),
      ext: ext || "FILE",
    });
  }

  for (const b of blocks) {
    if (b.kind !== "tool_call") continue;
    const path = extractMutationPath(b.toolCall);
    if (path) pushIfArtifact(path);
    const sideEffects = b.toolCall.sideEffects;
    if (sideEffects && b.toolCall.status === "success") {
      for (const eff of sideEffects) pushIfArtifact(eff.path);
    }
  }
  return out;
}

/**
 * Whether the assistant turn immediately following the user message at
 * `userIdx` contains a Write/Edit/NotebookEdit tool call. Used to decide
 * whether regenerating that turn needs a file-rollback confirmation when it's
 * the last turn (no later rounds to otherwise warn about).
 */
function nextAssistantHasFileEdit(
  messages: MessageView[],
  userIdx: number,
): boolean {
  const next = messages[userIdx + 1];
  if (!next || next.role !== "assistant") return false;
  return next.blocks.some(
    (b) =>
      b.kind === "tool_call" && MUTATION_TOOL_NAMES.has(b.toolCall.toolName),
  );
}

/* ---------------- ChatStreamProps ---------------- */

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
      | { type: "allow"; persistRule?: string }
      | { type: "deny"; message?: string }
      | AskUserAnswersDecision
    >;
  }) => Promise<void>;
  /** 「始终允许」本地持久化（按 cwd）。参数是 CC 规则串（见 ToolApprovalCard）。
   *  命中规则的工具调用由 sidecar 在 canUseTool 内放行，不再产生 interrupt，
   *  所以前端不再需要 allowlist 过滤闸口。 */
  onAllowAlways: (rule: string) => void;
  /**
   * Called when the user clicks "继续上次任务" on a process_restart notice.
   * Sends a follow-up prompt that resumes the previously interrupted turn —
   * the SDK session id replays the prior context so the agent picks up where
   * it left off.
   */
  onContinueAfterRestart: () => void;
  /** Conversation working directory — used to filter artifact cards to cwd. */
  workingDir: string | null;
  /** Click handler for inline artifact cards. */
  onOpenFile?: (info: { absolutePath: string }) => void;
  /** Re-run a user turn (discard it + later turns, roll back file edits). */
  onRegenerate?: (fromMessageId: string) => void;
}

// Streamdown code-fence override (`pre` → project CodeBlock with shiki +
// copy button) is shared with PreviewPane's markdown renderer; see
// `src/shared/markdown/MarkdownCodeBlock.tsx`.

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
  onAllowAlways,
  onContinueAfterRestart,
  workingDir,
  onOpenFile,
  onRegenerate,
}: ChatStreamProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  // Regenerate is disabled while a run is active or waiting for user action —
  // re-running mid-flight would race the live turn + truncate under it.
  const regenerateBusy = isRunning || pendingInterrupts.length > 0;
  // cast: ChatRuntime.subscribe takes (state) => void; RuntimeLike expects () => void.
  // The wrapper in useRunStatus discards the state arg, so this is safe at runtime.
  const status = useRunStatus(runtime as never);
  const isInsufficientCredits = status.errorCode === "INSUFFICIENT_CREDITS";
  const openCreditsTopUp = useCallback(() => {
    let url = "/pricing";
    try {
      url = new URL("/pricing", getWebsiteOrigin()).toString();
    } catch {
      // 环境缺官网 origin 时保留相对路径，避免充值按钮完全失效。
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);
  // 命中「始终允许」规则的工具调用由 sidecar 在 canUseTool 内直接放行，根本不会
  // 产生 interrupt，因此前端不再按 allowlist 过滤 —— 凡是到达这里的 interrupt 都
  // 需要用户决策，全部渲染卡片。
  const interruptsByToolId = useMemo(() => {
    const m = new Map<string, PendingInterrupt>();
    for (const it of pendingInterrupts) m.set(it.id, it);
    return m;
  }, [pendingInterrupts]);

  const renderApprovalCard = useCallback(
    (it: PendingInterrupt) => {
      if (it.reason === "ask_user") {
        const payload = it.payload as unknown as AskUserPayload;
        const questions = Array.isArray(payload?.questions)
          ? payload.questions
          : [];
        return (
          <AskUserCard
            key={it.id}
            questions={questions}
            onSubmit={(decision: AskUserAnswersDecision) =>
              void onResume({ decisions: [decision] })
            }
          />
        );
      }
      return (
        <ToolApprovalCard
          key={it.id}
          interrupt={it}
          onAllow={() => void onResume({ decisions: [{ type: "allow" }] })}
          onDeny={(reason) =>
            void onResume({ decisions: [{ type: "deny", message: reason }] })
          }
          onAllowAlways={(rule) => {
            // 1) 本地按 cwd 持久化（下次 run 经 approvalRules 注入 sidecar）。
            onAllowAlways(rule);
            // 2) 当前 run 立即生效：allow 续跑并把规则带给 sidecar 的 per-run registry。
            void onResume({
              decisions: [{ type: "allow", persistRule: rule }],
            });
          }}
        />
      );
    },
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
    return [...interruptsByToolId.values()].filter(
      (it) => !matchedIds.has(it.id),
    );
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
            <ApiKeyMissingBanner
              onConfigureClick={() => navigate("/settings")}
            />
          )}
          {status.errorCode === "RATE_LIMIT" && status.retry && (
            <RetryHint delayMs={status.retry.retryDelayMs} />
          )}
          {status.retry && status.status === "running" && (
            <div className="px-4 pt-2">
              <RetryingPill
                attempt={status.retry.attempt}
                maxRetries={status.retry.maxRetries}
              />
            </div>
          )}
          {messages.map((m, idx) => {
            const isLive =
              isRunning &&
              m.role === "assistant" &&
              idx === messages.length - 1;
            const isLastMessage = idx === messages.length - 1;
            // Parked at awaiting_user / legacy awaiting_approval: isRunning
            // is already false but the live turn isn't finished — it's paused
            // mid-flight. Treat it like streaming for artifact reveal so the
            // turn's file cards stay hidden until the run actually completes.
            const parkedForApproval =
              isLastMessage &&
              m.role === "assistant" &&
              pendingInterrupts.length > 0;
            // Regenerate scope (user turns only): how many later user-initiated
            // rounds would be discarded, and whether this turn's answer edited
            // files (drives the confirm dialog vs one-click).
            const laterRounds =
              m.role === "user"
                ? messages.slice(idx + 1).filter((x) => x.role === "user")
                    .length
                : 0;
            const willRollbackFiles =
              m.role === "user" && nextAssistantHasFileEdit(messages, idx);
            return (
              <MessageRow
                key={m.id}
                message={m}
                showActions={!isLive}
                isLastMessage={isLastMessage}
                streaming={isLive}
                parkedForApproval={parkedForApproval}
                interruptsByToolId={interruptsByToolId}
                renderApprovalCard={renderApprovalCard}
                onContinueAfterRestart={onContinueAfterRestart}
                workingDir={workingDir}
                onOpenFile={onOpenFile}
                onRegenerate={onRegenerate}
                regenerateDisabled={regenerateBusy}
                laterRounds={laterRounds}
                willRollbackFiles={willRollbackFiles}
              />
            );
          })}
          {isRunning && isThinking && (
            <div
              className="flex items-center gap-2 text-[13px]"
              style={{ color: "hsl(var(--text-300))" }}
            >
              <ThinkingSpinner size={16} />
              <span>{t("task.processGroup.summary.thought")}</span>
            </div>
          )}
          {isInsufficientCredits && (
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="text-destructive">
                {t("task.error.insufficientCredits")}
              </span>
              <button
                type="button"
                onClick={openCreditsTopUp}
                className="rounded-md border border-border px-2 py-1 text-[12px] font-medium text-foreground transition-colors hover:bg-muted"
              >
                {t("task.error.topUpCredits")}
              </button>
            </div>
          )}
          {error && !isInsufficientCredits && (
            <p
              className="text-[13px]"
              style={{ color: "hsl(var(--danger-100))" }}
            >
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
      if (isTaskTrackingToolName(b.toolCall.toolName)) {
        continue;
      }
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
  streaming,
  interruptsByToolId,
  renderApprovalCard,
  onContinueAfterRestart,
  workingDir,
  onOpenFile,
  onRegenerate,
  regenerateDisabled,
  laterRounds,
  willRollbackFiles,
  parkedForApproval,
}: {
  message: MessageView;
  showActions: boolean;
  /** True while this is the live assistant turn still receiving SSE events.
   *  Artifact cards stay hidden until streaming flips false — matches the
   *  "produce → reveal" rhythm of Cowork (full text first, then the card). */
  streaming: boolean;
  /** True when this turn is waiting for user action. The turn isn't finished,
   *  so artifact cards stay hidden — same
   *  as `streaming`, just for the parked-mid-flight case where isRunning has
   *  already gone false. */
  parkedForApproval: boolean;
  isLastMessage: boolean;
  interruptsByToolId: Map<string, PendingInterrupt>;
  renderApprovalCard: (it: PendingInterrupt) => ReactNode;
  onContinueAfterRestart: () => void;
  workingDir: string | null;
  onOpenFile?: (info: { absolutePath: string }) => void;
  onRegenerate?: (fromMessageId: string) => void;
  regenerateDisabled: boolean;
  laterRounds: number;
  willRollbackFiles: boolean;
}) {
  if (message.role === "user") {
    return (
      <UserMessage
        messageId={message.id}
        onRegenerate={onRegenerate}
        regenerateDisabled={regenerateDisabled}
        laterRounds={laterRounds}
        willRollbackFiles={willRollbackFiles}
      >
        {message.content}
      </UserMessage>
    );
  }

  const grouped = groupBlocks(message.blocks);
  // Copy only the assistant's prose — tool calls and reasoning (deep thinking)
  // are process detail, not the answer.
  const copyText = message.blocks
    .filter((b) => b.kind === "text")
    .map((b) => b.content)
    .join("\n\n");
  // Hold off on artifact cards until the turn has fully streamed. A Write
  // tool may succeed early in the turn while the model is still composing
  // the explanatory text — showing the card mid-stream feels premature
  // ("here's the file, also still talking"). Reveal once the turn settles.
  // Also hold while parked at awaiting_user / legacy awaiting_approval: the
  // turn paused for user action is not finished, so its earlier-succeeded writes must
  // not surface yet — reveal only when the run actually completes.
  const artifacts =
    streaming || parkedForApproval
      ? []
      : mutationToolCallsToArtifacts(message.blocks, workingDir);

  return (
    <div className="space-y-3">
      {grouped.map((b, i) => {
        if (b.kind === "process_group") {
          let matchingInterrupt: PendingInterrupt | undefined;
          for (const s of b.steps) {
            if (s.kind !== "tool_call") continue;
            const it = interruptsByToolId.get(s.tool.id);
            if (it) {
              matchingInterrupt = it;
              break;
            }
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
              className="prose-stream prose-chat text-[14px] leading-[1.75]"
              style={{ color: "hsl(var(--text-100))" }}
            >
              <Streamdown
                mode="streaming"
                parseIncompleteMarkdown
                isAnimating={streaming || parkedForApproval}
                components={STREAMDOWN_MARKDOWN_COMPONENTS}
                plugins={STREAMDOWN_PLUGINS}
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
      {artifacts.length > 0 && (
        <div className="space-y-2">
          {artifacts.map((a) => (
            <ArtifactInlineCard
              key={a.absolutePath}
              title={a.name}
              kind={a.kind}
              ext={a.ext}
              absolutePath={a.absolutePath}
              onOpen={() => onOpenFile?.({ absolutePath: a.absolutePath })}
            />
          ))}
        </div>
      )}
      {showActions && <MessageActions text={copyText} />}
    </div>
  );
}
