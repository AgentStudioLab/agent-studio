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
import { Terminal, FileText, Search, Globe, Folder, Wrench } from "lucide-react";
import { useState, type ReactNode } from "react";
import { diffLines } from "diff";

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
  onDeny: () => void;
  onAllowAlways?: (toolName: string) => void;
}

export function ToolApprovalCard({ interrupt, onAllow, onDeny, onAllowAlways }: ToolApprovalCardProps) {
  const payload = interrupt.payload as ApprovalPayload;
  const toolName = payload.toolName ?? "tool";
  const input = (payload.input ?? {}) as Record<string, unknown>;

  const { icon, title, body } = renderTool(toolName, input, payload.title);

  return (
    <Confirmation approval={{ id: interrupt.id }} state="approval-requested">
      <ConfirmationTitle>
        <span className="inline-flex items-center gap-2">
          {icon}
          {title}
        </span>
      </ConfirmationTitle>
      {body}
      <ConfirmationRequest>
        <ConfirmationActions>
          <ConfirmationAction variant="outline" onClick={onDeny}>拒绝</ConfirmationAction>
          {onAllowAlways && payload.toolName && (
            <ConfirmationAction
              variant="outline"
              onClick={() => {
                onAllowAlways(payload.toolName!);
                onAllow();
              }}
            >
              始终允许 {payload.toolName}
            </ConfirmationAction>
          )}
          <ConfirmationAction onClick={onAllow}>允许</ConfirmationAction>
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
