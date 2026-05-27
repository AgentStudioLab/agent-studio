import { useEffect, useState } from "react";
import {
  BrainIcon,
  Check,
  ChevronDown,
  FileEdit,
  FileText,
  Globe,
  Loader2,
  Search,
  Sparkles,
  Terminal,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { ToolCallView } from "@/lib/agui/runtime";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from "@/components/ai-elements/code-block";
import type { BundledLanguage } from "shiki";

/**
 * One mixed step inside the group. The agent's interleaved "thought (reasoning)
 * + action (tool call)" trace, in arrival order.
 */
export type ProcessStep =
  | { kind: "reasoning"; id: string; content: string }
  | { kind: "tool_call"; tool: ToolCallView };

interface ProcessGroupProps {
  steps: ProcessStep[];
  /**
   * True when this group is followed by a regular text block — typically the
   * first token of the final assistant answer. Auto-collapses + appends ✓ Done.
   * False = still in flight (or unterminated trailing group); stays open.
   */
  done: boolean;
}

/**
 * Vertical "thought + action" timeline. One group per uninterrupted run of
 * reasoning + tool_call blocks inside an assistant turn (per user spec —
 * only a `text` block flushes the group to done).
 *
 * Reasoning steps render as plain dim text with a brain icon — no nested
 * <Reasoning> collapsible. The whole group is the collapsible primitive.
 */
export function ProcessGroup({ steps, done }: ProcessGroupProps) {
  // Open while live. Auto-collapse on done transition. User can re-toggle
  // manually after that without fighting the auto-collapse.
  const [open, setOpen] = useState(!done);
  const [userToggled, setUserToggled] = useState(false);

  useEffect(() => {
    if (done && !userToggled) setOpen(false);
  }, [done, userToggled]);

  const summary = buildSummary(steps);

  return (
    // Top padding stays fixed so the trigger button doesn't jump on toggle;
    // bottom padding grows when expanded to leave breathing room under the
    // last timeline step / DoneRow. Collapsed: 12/12. Expanded: 12/20.
    <div
      className={cn("rounded-xl px-5 pt-3", open ? "pb-5" : "pb-3")}
      style={{
        background: "hsl(var(--bg-200) / 0.35)",
        border: "1px solid hsl(var(--border-300) / 0.08)",
      }}
    >
      <button
        type="button"
        onClick={() => {
          setUserToggled(true);
          setOpen((v) => !v);
        }}
        className="flex w-full items-center gap-1.5 text-[13px] transition-colors"
        style={{ color: "hsl(var(--text-300))" }}
      >
        <span>{summary}</span>
        <ChevronDown
          size={11}
          className={"transition-transform " + (open ? "" : "-rotate-90")}
        />
      </button>
      {open && (
        <div className="mt-4 flex flex-col">
          {steps.map((s, i) => (
            <StepRow
              key={stepKey(s, i)}
              step={s}
              isLast={!done && i === steps.length - 1}
            />
          ))}
          {done && <DoneRow />}
        </div>
      )}
    </div>
  );
}

function stepKey(s: ProcessStep, i: number): string {
  return s.kind === "reasoning" ? `r:${s.id}:${i}` : `t:${s.tool.id}`;
}

/* ---------------- step row + done ---------------- */

function StepRow({ step, isLast }: { step: ProcessStep; isLast: boolean }) {
  if (step.kind === "reasoning") {
    return <ReasoningStep content={step.content} isLast={isLast} />;
  }
  return <ToolStep tool={step.tool} isLast={isLast} />;
}

function ReasoningStep({
  content,
  isLast,
}: {
  content: string;
  isLast: boolean;
}) {
  return (
    <div className="relative flex gap-3">
      <div className="flex shrink-0 flex-col items-center">
        <div
          className="mt-0.5 flex h-6 w-6 items-center justify-center"
          style={{ color: "hsl(var(--text-400))" }}
        >
          <BrainIcon size={14} strokeWidth={1.6} />
        </div>
        {!isLast && (
          <div
            className="mt-1 w-px min-h-[14px] flex-1"
            style={{ background: "hsl(var(--border-300) / 0.2)" }}
          />
        )}
      </div>
      <div className="min-w-0 flex-1 pb-3 pt-1">
        <p
          className="whitespace-pre-wrap text-[12.5px] leading-[1.65]"
          style={{ color: "hsl(var(--text-300))" }}
        >
          {content}
        </p>
      </div>
    </div>
  );
}

/**
 * One step in the timeline. The whole title row is a Collapsible trigger —
 * clicking it expands an inline panel beneath with the tool's args (always)
 * and result (when available). Pending tools render a spinner in the icon
 * slot instead of their wrench/terminal/etc icon.
 */
function ToolStep({ tool, isLast }: { tool: ToolCallView; isLast: boolean }) {
  const Icon = iconFor(tool.toolName);
  const title = titleFor(tool);
  const chip = chipFor(tool);
  const pending = tool.status === "pending";

  return (
    <Collapsible>
      <div className="relative flex gap-3">
        <div className="flex shrink-0 flex-col items-center">
          <div
            className="mt-0.5 flex h-6 w-6 items-center justify-center"
            style={{
              color: pending
                ? "hsl(var(--brand-100))"
                : "hsl(var(--text-300))",
            }}
          >
            {pending ? (
              <Loader2 size={14} strokeWidth={1.8} className="animate-spin" />
            ) : (
              <Icon size={16} strokeWidth={1.6} />
            )}
          </div>
          {!isLast && (
            <div
              className="mt-1 w-px min-h-[14px] flex-1"
              style={{ background: "hsl(var(--border-300) / 0.2)" }}
            />
          )}
        </div>
        <div className="min-w-0 flex-1 pb-3">
          <CollapsibleTrigger
            className="group flex w-full items-center gap-1.5 pt-1 text-left"
            // Affordance is the title hover, not a leading chevron — keeps
            // long tool runs visually clean. Open state nudges title to
            // foreground so the user knows what's expanded.
          >
            <span
              className="truncate text-[13.5px] leading-tight transition-colors group-hover:text-[hsl(var(--text-100))] group-data-[state=open]:text-[hsl(var(--text-100))]"
              style={{ color: "hsl(var(--text-200))" }}
            >
              {title}
            </span>
          </CollapsibleTrigger>
          {chip && (
            <div className="mt-1.5">
              <span
                className="inline-block rounded-md px-2 py-0.5 font-mono text-[10.5px]"
                style={chip.style}
              >
                {chip.label}
              </span>
            </div>
          )}
          <CollapsibleContent className="mt-2 space-y-2">
            <ToolDetailPane tool={tool} />
          </CollapsibleContent>
        </div>
      </div>
    </Collapsible>
  );
}

/**
 * Expanded body of a tool step. Renders args + result using the project's
 * CodeBlock so the visual treatment matches markdown code fences in the
 * assistant's final answer.
 */
function ToolDetailPane({ tool }: { tool: ToolCallView }) {
  const argsText = formatJson(tool.args);
  const resultLang = inferResultLanguage(tool.result);
  const resultText = formatResult(tool.result);

  return (
    <>
      <div className="space-y-1">
        <div
          className="text-[10.5px] font-medium uppercase tracking-wide"
          style={{ color: "hsl(var(--text-400))" }}
        >
          Args
        </div>
        <CodeBlock code={argsText} language="json">
          <CodeBlockHeader>
            <CodeBlockTitle>
              <CodeBlockFilename>json</CodeBlockFilename>
            </CodeBlockTitle>
            <CodeBlockActions>
              <CodeBlockCopyButton />
            </CodeBlockActions>
          </CodeBlockHeader>
        </CodeBlock>
      </div>
      {resultText !== null && (
        <div className="space-y-1">
          <div
            className="text-[10.5px] font-medium uppercase tracking-wide"
            style={{
              color:
                tool.status === "error"
                  ? "hsl(var(--danger-100))"
                  : "hsl(var(--text-400))",
            }}
          >
            {tool.status === "error" ? "Error" : "Result"}
          </div>
          <CodeBlock code={resultText} language={resultLang}>
            <CodeBlockHeader>
              <CodeBlockTitle>
                <CodeBlockFilename>{resultLang}</CodeBlockFilename>
              </CodeBlockTitle>
              <CodeBlockActions>
                <CodeBlockCopyButton />
              </CodeBlockActions>
            </CodeBlockHeader>
          </CodeBlock>
        </div>
      )}
      {resultText === null && tool.status === "pending" && (
        <p
          className="text-[12px]"
          style={{ color: "hsl(var(--text-400))" }}
        >
          Running…
        </p>
      )}
    </>
  );
}

function formatJson(v: unknown): string {
  try {
    return JSON.stringify(v ?? {}, null, 2);
  } catch {
    return String(v);
  }
}

function inferResultLanguage(result: unknown): BundledLanguage {
  if (typeof result === "string") return "text" as BundledLanguage;
  return "json" as BundledLanguage;
}

function formatResult(result: unknown): string | null {
  if (result === null || result === undefined) return null;
  if (typeof result === "string") return result;
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

function DoneRow() {
  return (
    <div className="flex items-center gap-3 pt-1">
      <div
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
        style={{ border: "1.5px solid hsl(var(--text-300) / 0.5)" }}
      >
        <Check
          size={11}
          strokeWidth={2.5}
          style={{ color: "hsl(var(--text-300))" }}
        />
      </div>
      <span
        className="text-[13.5px]"
        style={{ color: "hsl(var(--text-200))" }}
      >
        Done
      </span>
    </div>
  );
}

/* ---------------- helpers (icon / title / chip / summary) ---------------- */

const TOOL_ICON_MAP: Record<string, LucideIcon> = {
  Bash: Terminal,
  Read: FileText,
  Write: FileEdit,
  Edit: FileEdit,
  MultiEdit: FileEdit,
  NotebookEdit: FileEdit,
  Glob: Search,
  Grep: Search,
  WebSearch: Search,
  WebFetch: Globe,
  Task: Sparkles,
};

function iconFor(toolName: string): LucideIcon {
  return TOOL_ICON_MAP[toolName] ?? Wrench;
}

function titleFor(tool: ToolCallView): string {
  const args = (tool.args ?? {}) as Record<string, unknown>;
  const basename = (p: unknown): string =>
    typeof p === "string" ? (p.split("/").pop() ?? p) : "";
  switch (tool.toolName) {
    case "Bash":
      return "Running command";
    case "Read":
      return `Read ${basename(args.file_path)}`;
    case "Write":
      return `Wrote ${basename(args.file_path)}`;
    case "Edit":
    case "MultiEdit":
      return `Edited ${basename(args.file_path)}`;
    case "Glob": {
      const pat = typeof args.pattern === "string" ? args.pattern : "";
      return pat ? `Glob ${pat}` : "Glob";
    }
    case "Grep": {
      const pat = typeof args.pattern === "string" ? args.pattern : "";
      return pat ? `Grep ${pat}` : "Grep";
    }
    case "WebFetch":
      return `Fetched ${typeof args.url === "string" ? args.url : "url"}`;
    case "WebSearch":
      return `Searched ${typeof args.query === "string" ? args.query : ""}`;
    case "Task":
      return "Subagent task";
    default:
      return tool.toolName;
  }
}

function chipFor(
  tool: ToolCallView,
): { label: string; style: { background: string; color: string } } | null {
  if (tool.status === "error") {
    return {
      label: "Error",
      style: {
        background: "hsl(var(--danger-100) / 0.18)",
        color: "hsl(var(--danger-100))",
      },
    };
  }
  return null;
}

/**
 * Summary header. Counts tool families and prepends a "Thought" segment
 * when reasoning steps are present, so the user knows the group also
 * includes thinking content even before expanding.
 */
function buildSummary(steps: ProcessStep[]): string {
  const hasReasoning = steps.some((s) => s.kind === "reasoning");
  const tools = steps.flatMap((s) => (s.kind === "tool_call" ? [s.tool] : []));

  const counts: Record<string, number> = {};
  const family = (name: string): string => {
    switch (name) {
      case "Bash":
        return "command";
      case "Read":
        return "file read";
      case "Write":
        return "file write";
      case "Edit":
      case "MultiEdit":
        return "file edit";
      case "Glob":
      case "Grep":
        return "search";
      case "WebFetch":
        return "web fetch";
      case "WebSearch":
        return "web search";
      case "Task":
        return "subagent";
      default:
        return "tool call";
    }
  };
  for (const t of tools) {
    const f = family(t.toolName);
    counts[f] = (counts[f] ?? 0) + 1;
  }
  const phrases = Object.entries(counts).map(([f, n]) =>
    n === 1 ? `1 ${f}` : `${n} ${f}s`,
  );

  if (phrases.length === 0) return hasReasoning ? "Thought" : "Working";
  const ran = `Ran ${phrases.join(", ")}`;
  return hasReasoning ? `Thought, ${ran.toLowerCase()}` : ran;
}
