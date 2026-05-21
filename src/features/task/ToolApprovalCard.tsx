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
import type { PendingInterrupt } from "@/lib/agui/runtime";
import { Terminal, FileText, Search, Globe, Folder, Wrench, AlertTriangle } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { diffLines } from "diff";
import { assessToolRisk } from "./tool-risk";

// Singleton "first card wins" election. When multiple approval cards are
// visible (rare but possible during a multi-tool turn), only the first to
// mount binds the global keydown — pressing Enter shouldn't blindly approve
// every pending card at once. Mutable on purpose: useEffect cleanup clears
// it back to null when the active card unmounts so the next card can claim.
const activeCardId: { current: string | null } = { current: null };

// Long Write/Edit payloads (e.g. writing a 250-line doc) would otherwise
// either flood the card or get hard-truncated with "+N chars". Show the
// first PREVIEW_LINES, then offer an inline expand.
const PREVIEW_LINES = 20;

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
  onAllowAlways?: (toolName: string) => void;
}

export function ToolApprovalCard({ interrupt, onAllow, onDeny, onAllowAlways }: ToolApprovalCardProps) {
  const payload = interrupt.payload as ApprovalPayload;
  const toolName = payload.toolName ?? "tool";
  const input = (payload.input ?? {}) as Record<string, unknown>;

  const { icon, title, body } = renderTool(toolName, input, payload.title);
  const risk = assessToolRisk(toolName, input);

  const [denyExpanded, setDenyExpanded] = useState(false);
  const [denyReason, setDenyReason] = useState("");

  const submitDeny = () => onDeny(denyReason.trim() || "User declined");

  const handleDenyClick = () => {
    if (!denyExpanded) {
      setDenyExpanded(true);
      queueMicrotask(() => {
        document.getElementById(`deny-${interrupt.id}`)?.focus();
      });
      return;
    }
    submitDeny();
  };

  // Singleton keydown: Enter = allow, Cmd/Ctrl+Enter = allow-always (if
  // available), Esc = collapse deny textarea (if open) else deny w/ default.
  // Skip when focus is in an input/textarea/contentEditable so the user can
  // type freely inside the deny textarea without triggering allow on Enter.
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
          onAllowAlways(payload.toolName);
          onAllow();
        }
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        onAllow();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        if (denyExpanded) setDenyExpanded(false);
        else onDeny("User declined");
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (activeCardId.current === interrupt.id) activeCardId.current = null;
    };
  }, [interrupt.id, onAllow, onDeny, onAllowAlways, denyExpanded, payload.toolName]);

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
      {denyExpanded && (
        <textarea
          id={`deny-${interrupt.id}`}
          value={denyReason}
          onChange={(e) => setDenyReason(e.target.value)}
          placeholder="（可选）告诉 agent 为什么拒绝，按 ⌘⏎ 确认"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submitDeny();
            }
          }}
          className="w-full min-h-[60px] resize-y rounded-md border bg-transparent px-3 py-2 text-[13px] outline-none"
          style={{
            borderColor: "hsl(var(--border-300))",
            color: "hsl(var(--text-100))",
          }}
        />
      )}
      <ConfirmationRequest>
        <ConfirmationActions>
          <ConfirmationAction variant="outline" onClick={handleDenyClick}>
            {denyExpanded ? "确认拒绝" : "拒绝"}
            <kbd className="ml-1 opacity-60">Esc</kbd>
          </ConfirmationAction>
          {onAllowAlways && payload.toolName && (
            <ConfirmationAction
              variant="outline"
              onClick={() => {
                onAllowAlways(payload.toolName!);
                onAllow();
              }}
            >
              始终允许 {payload.toolName}
              <kbd className="ml-1 opacity-60">⌘⏎</kbd>
            </ConfirmationAction>
          )}
          <ConfirmationAction onClick={onAllow}>
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

function ToolCodeBlock({ code, lang, filename }: { code: string; lang: BundledLanguage | "text"; filename: string }) {
  const lines = code.split("\n");
  const needsCollapse = lines.length > PREVIEW_LINES;
  const [expanded, setExpanded] = useState(false);

  const display = !needsCollapse || expanded
    ? code
    : lines.slice(0, PREVIEW_LINES).join("\n");
  const hidden = needsCollapse ? lines.length - PREVIEW_LINES : 0;

  const block = (
    <CodeBlock code={display} language={lang as BundledLanguage} className="my-0">
      <CodeBlockHeader>
        <CodeBlockTitle><CodeBlockFilename>{filename}</CodeBlockFilename></CodeBlockTitle>
        <CodeBlockActions><CodeBlockCopyButton /></CodeBlockActions>
      </CodeBlockHeader>
    </CodeBlock>
  );

  return (
    <div>
      {expanded ? (
        <div className="max-h-[60vh] overflow-y-auto rounded-md">{block}</div>
      ) : (
        block
      )}
      {needsCollapse && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 text-[12px] hover:underline"
          style={{ color: "hsl(var(--text-300))" }}
        >
          {expanded ? "收起" : `展开（剩余 ${hidden} 行）`}
        </button>
      )}
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
  return {
    icon: <FileText size={14} />,
    title: title ?? `写入 ${filePath}（${lines} 行）`,
    body: <ToolCodeBlock code={content} lang="text" filename={filePath} />,
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
