import {
  Confirmation,
  ConfirmationActions,
  ConfirmationAction,
  ConfirmationRequest,
  ConfirmationTitle,
} from "@/components/ai-elements/confirmation";
import {
  CodeBlock,
  CodeBlockHeader,
  CodeBlockTitle,
  CodeBlockFilename,
  CodeBlockActions,
  CodeBlockCopyButton,
} from "@/components/ai-elements/code-block";
import type { BundledLanguage } from "shiki";
import { languageFromPath } from "@/lib/code-lang";
import type { PendingInterrupt } from "@/lib/agui/runtime";
import { Terminal, FileText, Search, Globe, Folder, Wrench, AlertTriangle } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { diffLines } from "diff";
import { assessToolRisk } from "./tool-risk";
import { buildBashRule, type BashRuleScope } from "./bash-rule";

// Singleton "first card wins" election. When multiple approval cards are
// visible (rare but possible during a multi-tool turn), only the first to
// mount binds the global keydown — pressing Enter shouldn't blindly approve
// every pending card at once. Mutable on purpose: useEffect cleanup clears
// it back to null when the active card unmounts so the next card can claim.
const activeCardId: { current: string | null } = { current: null };

interface ApprovalPayload {
  toolName?: string;
  input?: Record<string, unknown>;
  title?: string;
  description?: string;
}

export interface ToolApprovalCardProps {
  interrupt: PendingInterrupt;
  onAllow: () => void;
  onDeny: (reason: string) => void;
  /** 「始终允许」自包含回调：参数是要沉淀的 CC 规则串（Bash 为命令模式，如
   *  `Bash(git status:*)`；其它工具为裸名 = 整工具）。调用方负责本地持久化 +
   *  带 persistRule 续跑（见 ChatStream），故 card 不再额外调 onAllow。 */
  onAllowAlways?: (rule: string) => void;
}

export function ToolApprovalCard({ interrupt, onAllow, onDeny, onAllowAlways }: ToolApprovalCardProps) {
  const payload = interrupt.payload as ApprovalPayload;
  const toolName = payload.toolName ?? "tool";
  const input = (payload.input ?? {}) as Record<string, unknown>;

  const { icon, title, body } = renderTool(toolName, input, payload.title);
  const risk = assessToolRisk(toolName, input);

  // Guard against keyboard + click both firing onDeny/onAllow for the same
  // interrupt — useChat/runtime.resume early-returns when pendingInterrupts
  // is empty, but a double-fire still races on the closure check, and a 2nd
  // call to onAllow/onDeny is wasted work either way.
  const [acted, setActed] = useState(false);
  const fireDeny = useCallback(() => {
    if (acted) return;
    setActed(true);
    onDeny("User declined");
  }, [acted, onDeny]);
  const fireAllow = useCallback(() => {
    if (acted) return;
    setActed(true);
    onAllow();
  }, [acted, onAllow]);
  // 只有 Bash 才有命令级粒度；其它工具「始终允许」= 裸工具名（整工具放行）。
  const isBash = toolName === "Bash";
  const bashCommand = String(input.command ?? "");
  // 命令为空的 Bash（理论上不会出现）不提供「始终允许」，避免生成退化规则
  // （Bash() / Bash(:*)）。其它工具用裸名，无此限制。
  const canAllowAlways =
    !!onAllowAlways && !!payload.toolName && (!isBash || bashCommand.trim().length > 0);
  const fireAllowAlways = useCallback(
    (scope: BashRuleScope) => {
      if (acted || !payload.toolName || !onAllowAlways) return;
      if (isBash && !bashCommand.trim()) return;
      setActed(true);
      // Bash → 按所选粒度生成规则；其它工具 → 裸名。onAllowAlways 自包含
      // （持久化 + 带 persistRule 续跑），故这里不再调用 onAllow。
      const rule = isBash ? buildBashRule(bashCommand, scope) : payload.toolName;
      onAllowAlways(rule);
    },
    [acted, onAllowAlways, payload.toolName, isBash, bashCommand],
  );

  // Singleton keydown: Enter = allow, Cmd/Ctrl+Enter = allow-always (if
  // available), Esc = deny. Skip when focus is in an input/textarea so the
  // user can type freely without triggering shortcuts.
  useEffect(() => {
    if (activeCardId.current === null) activeCardId.current = interrupt.id;
    if (activeCardId.current !== interrupt.id) return;

    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const inField =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (e.target as HTMLElement | null)?.isContentEditable === true;
      if (inField) return;

      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        if (onAllowAlways && payload.toolName) {
          e.preventDefault();
          // ⌘⏎ → Bash 取「此前缀」（推荐档）；非 Bash 工具忽略 scope，按裸名整工具。
          fireAllowAlways("prefix");
        }
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        fireAllow();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        fireDeny();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (activeCardId.current === interrupt.id) activeCardId.current = null;
    };
  }, [interrupt.id, fireAllow, fireDeny, fireAllowAlways, onAllowAlways, payload.toolName, isBash]);

  return (
    <Confirmation approval={{ id: interrupt.id }} state="approval-requested">
      <ConfirmationTitle>
        <span className="inline-flex items-center gap-2">
          {icon}
          {title}
          {risk.level !== "none" && risk.label && (
            <span
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]"
              style={{
                background:
                  risk.level === "high"
                    ? "hsl(var(--danger-100) / 0.15)"
                    : "hsl(var(--warning-100) / 0.15)",
                color:
                  risk.level === "high"
                    ? "hsl(var(--danger-100))"
                    : "hsl(var(--warning-100))",
              }}
            >
              <AlertTriangle size={11} />
              {risk.label}
            </span>
          )}
        </span>
      </ConfirmationTitle>
      {body}
      <ConfirmationRequest>
        <ConfirmationActions>
          <ConfirmationAction variant="outline" onClick={fireDeny} disabled={acted}>
            拒绝
            <kbd className="ml-1 opacity-60">Esc</kbd>
          </ConfirmationAction>
          {/* 单个「始终允许」按钮，不再弹下拉选粒度。Bash 走推荐的命令前缀
              规则（与 ⌘⏎ 一致）；其它工具用裸名 = 整工具放行。 */}
          {canAllowAlways && (
            <ConfirmationAction variant="outline" onClick={() => fireAllowAlways("prefix")} disabled={acted}>
              {isBash ? "始终允许" : `始终允许 ${payload.toolName}`}
              <kbd className="ml-1 opacity-60">⌘⏎</kbd>
            </ConfirmationAction>
          )}
          <ConfirmationAction onClick={fireAllow} disabled={acted}>
            允许
            <kbd className="ml-1 opacity-60">⏎</kbd>
          </ConfirmationAction>
        </ConfirmationActions>
      </ConfirmationRequest>
    </Confirmation>
  );
}

interface ToolRender {
  icon: ReactNode;
  title: string;
  body: ReactNode;
}

function renderTool(name: string, input: Record<string, unknown>, override?: string): ToolRender {
  switch (name) {
    case "Bash":      return renderBash(input, override);
    case "Read":      return renderRead(input, override);
    case "Edit":      return renderEdit(input, override);
    case "Write":     return renderWrite(input, override);
    case "Glob":      return renderGlob(input, override);
    case "Grep":      return renderGrep(input, override);
    case "WebSearch": return renderWebSearch(input, override);
    case "WebFetch":  return renderWebFetch(input, override);
    default:          return renderFallback(name, input, override);
  }
}

// Render the full code in a max-height scrollable container — no expand /
// collapse toggle. The 60vh ceiling keeps the approval card from pushing
// the action buttons off-screen on long payloads; anything beyond that
// scrolls in-place.
function ToolCodeBlock({ code, lang, filename }: { code: string; lang: BundledLanguage | "text"; filename: string }) {
  return (
    <div className="max-h-[60vh] overflow-y-auto rounded-md">
      <CodeBlock code={code} language={lang as BundledLanguage} className="my-0">
        <CodeBlockHeader>
          <CodeBlockTitle><CodeBlockFilename>{filename}</CodeBlockFilename></CodeBlockTitle>
          <CodeBlockActions><CodeBlockCopyButton /></CodeBlockActions>
        </CodeBlockHeader>
      </CodeBlock>
    </div>
  );
}

function renderBash(input: Record<string, unknown>, title?: string): ToolRender {
  const command = String(input.command ?? "");
  const cwd = typeof input.cwd === "string" ? input.cwd : undefined;
  return {
    icon: <Terminal size={14} />,
    title: title ?? "Agent Studio wants to run a shell command",
    body: <ToolCodeBlock code={command} lang="bash" filename={cwd ?? "shell"} />,
  };
}

function renderRead(input: Record<string, unknown>, title?: string): ToolRender {
  const filePath = String(input.file_path ?? "");
  const offset = typeof input.offset === "number" ? input.offset : undefined;
  const limit = typeof input.limit === "number" ? input.limit : undefined;
  const range = offset !== undefined || limit !== undefined
    ? `（L${offset ?? 1}${limit ? `–L${(offset ?? 1) + limit - 1}` : "+"}）`
    : "";
  return {
    icon: <FileText size={14} />,
    title: title ?? `读取 ${filePath}${range}`,
    body: null,
  };
}

function renderEdit(input: Record<string, unknown>, title?: string): ToolRender {
  const filePath = String(input.file_path ?? "");
  const oldStr = String(input.old_string ?? "");
  const newStr = String(input.new_string ?? "");
  const replaceAll = input.replace_all === true;
  return {
    icon: <FileText size={14} />,
    title: title ?? `编辑 ${filePath}${replaceAll ? "（全部匹配）" : ""}`,
    body: <ToolCodeBlock code={buildLineDiff(oldStr, newStr)} lang="diff" filename={filePath} />,
  };
}

/**
 * Render a real line-level diff via jsdiff. Each hunk part is either:
 *   - added:    every line prefixed `+ ` (the new_string contribution)
 *   - removed:  every line prefixed `- ` (the old_string contribution)
 *   - context:  every line prefixed `  ` (unchanged in both)
 * Trailing empty line from `.split("\n")` is dropped so unchanged blocks
 * don't render a phantom blank context line.
 */
function buildLineDiff(oldStr: string, newStr: string): string {
  const parts = diffLines(oldStr, newStr);
  const out: string[] = [];
  for (const p of parts) {
    const lines = p.value.split("\n");
    if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    const prefix = p.added ? "+ " : p.removed ? "- " : "  ";
    for (const line of lines) out.push(prefix + line);
  }
  return out.join("\n");
}

function renderWrite(input: Record<string, unknown>, title?: string): ToolRender {
  const filePath = String(input.file_path ?? "");
  const content = String(input.content ?? "");
  const lines = content.split("\n").length;
  // Language inferred from extension — same helper PreviewPane uses. Without
  // this, write previews land as monochrome monospace text even for JS/TS/
  // Python where the surrounding chat surface offers full shiki coloring.
  return {
    icon: <FileText size={14} />,
    title: title ?? `写入 ${filePath}（${lines} 行）`,
    body: <ToolCodeBlock code={content} lang={languageFromPath(filePath)} filename={filePath} />,
  };
}

function renderGlob(input: Record<string, unknown>, title?: string): ToolRender {
  const pattern = String(input.pattern ?? "");
  const path = typeof input.path === "string" ? input.path : undefined;
  return {
    icon: <Folder size={14} />,
    title: title ?? `查找文件：${pattern}`,
    body: path ? <p className="text-[12px]" style={{ color: "hsl(var(--text-300))" }}>at <code>{path}</code></p> : null,
  };
}

function renderGrep(input: Record<string, unknown>, title?: string): ToolRender {
  const pattern = String(input.pattern ?? "");
  const path = typeof input.path === "string" ? input.path : undefined;
  const glob = typeof input.glob === "string" ? input.glob : undefined;
  return {
    icon: <Search size={14} />,
    title: title ?? `搜索：${pattern}`,
    body: (path || glob) ? (
      <p className="text-[12px]" style={{ color: "hsl(var(--text-300))" }}>
        {path && <>at <code>{path}</code> </>}
        {glob && <>filter <code>{glob}</code></>}
      </p>
    ) : null,
  };
}

function renderWebSearch(input: Record<string, unknown>, title?: string): ToolRender {
  const query = String(input.query ?? "");
  return {
    icon: <Search size={14} />,
    title: title ?? `网页搜索：${query}`,
    body: null,
  };
}

function renderWebFetch(input: Record<string, unknown>, title?: string): ToolRender {
  const url = String(input.url ?? "");
  const prompt = typeof input.prompt === "string" ? input.prompt : undefined;
  return {
    icon: <Globe size={14} />,
    title: title ?? `抓取网页：${url}`,
    body: prompt ? <p className="text-[12px]" style={{ color: "hsl(var(--text-300))" }}>{prompt}</p> : null,
  };
}

function renderFallback(name: string, input: Record<string, unknown>, title?: string): ToolRender {
  let dump = "";
  try { dump = JSON.stringify(input, null, 2); } catch { dump = String(input); }
  return {
    icon: <Wrench size={14} />,
    title: title ?? `Agent Studio wants to run ${name}`,
    body: <ToolCodeBlock code={dump} lang="text" filename="input" />,
  };
}
