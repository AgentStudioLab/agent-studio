import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useThreadPlan } from "@/lib/agui/react/useThreadPlan";
import { useThreadRunMeta } from "@/lib/agui/react/useThreadRunMeta";
import type { TodoEntry, TodoStatus } from "@/lib/agui/runtime/derivations";
import type { ChatState } from "@/lib/agui/runtime/types";

interface ProcessTabProps {
  state: ChatState | null;
}

function formatElapsed(seconds: number): string {
  const mm = Math.floor(seconds / 60).toString().padStart(2, "0");
  const ss = (seconds % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function StepIndicator({ status }: { status: TodoStatus }) {
  if (status === "completed") {
    return (
      <span
        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
        style={{ background: "hsl(var(--success-100))" }}
      >
        <Check size={12} strokeWidth={2.5} style={{ color: "hsl(var(--oncolor-100))" }} />
      </span>
    );
  }
  if (status === "in_progress") {
    return (
      <span
        className="relative w-6 h-6 rounded-full flex items-center justify-center shrink-0"
        style={{ background: "hsl(var(--brand-100))" }}
      >
        <span
          className="absolute -inset-1 rounded-full pulse-dot"
          style={{ background: "hsl(var(--brand-100))", opacity: 0.2 }}
        />
        <span
          className="relative w-2 h-2 rounded-full"
          style={{ background: "hsl(var(--oncolor-100))" }}
        />
      </span>
    );
  }
  return (
    <span
      className="w-6 h-6 rounded-full shrink-0"
      style={{ border: "1.5px dashed hsl(var(--text-400) / 0.4)" }}
    />
  );
}

function ProcessStep({
  todo,
  isLast,
}: {
  todo: TodoEntry;
  isLast: boolean;
}) {
  const label =
    todo.status === "in_progress" && todo.activeForm ? todo.activeForm : todo.content;
  return (
    <div className="relative flex gap-3">
      <div className="flex flex-col items-center shrink-0">
        <StepIndicator status={todo.status} />
        {!isLast && (
          <div
            className="flex-1 w-px mt-1 mb-1 min-h-[18px]"
            style={{
              background:
                todo.status === "completed"
                  ? "hsl(var(--success-100) / 0.5)"
                  : "hsl(var(--border-300) / 0.2)",
            }}
          />
        )}
      </div>
      <div className="flex-1 min-w-0 pt-0.5 pb-4">
        <div
          className={cn(
            "text-[13px] leading-snug",
            todo.status === "in_progress" && "text-text-100 font-medium",
            todo.status === "completed" && "text-text-200",
            todo.status === "pending" && "text-text-400",
          )}
        >
          {label}
        </div>
      </div>
    </div>
  );
}

export function ProcessTab({ state }: ProcessTabProps) {
  const { t } = useTranslation();
  const { todos } = useThreadPlan(state);
  const { elapsedSeconds, isRunning } = useThreadRunMeta(state);

  const doneCount = todos.filter((s) => s.status === "completed").length;
  const totalCount = todos.length;

  if (totalCount === 0) {
    // No TodoWrite yet — show empty state. If a run is active, still
    // render the elapsed banner so users see something is happening.
    return (
      <div>
        <div className="px-6 py-12 text-center text-sm" style={{ color: "hsl(var(--text-300))" }}>
          {t("task.processTab.empty.notStarted")}
        </div>
        {isRunning && (
          <div
            className="mt-3 mx-2 px-3 py-2 rounded-md text-[11.5px] text-text-400 leading-relaxed"
            style={{
              background: "hsl(var(--bg-200) / 0.4)",
              border: "1px solid hsl(var(--border-300) / 0.08)",
            }}
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-success-100 pulse-dot mr-2 align-middle" />
            {t("task.processTab.status.running")} ·{" "}
            {t("task.processTab.elapsed", { time: formatElapsed(elapsedSeconds) })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between px-2 pt-3 pb-3">
        <span className="text-[11px] tracking-wider uppercase text-text-400">
          {t("task.processTab.plan")}
        </span>
        <span className="text-[11.5px] text-text-300 font-mono">
          {t("task.processTab.countOf", { done: doneCount, total: totalCount })}
        </span>
      </div>
      <div className="px-2">
        {todos.map((todo, i) => (
          <ProcessStep
            key={`${todo.content.slice(0, 64)}-${i}`}
            todo={todo}
            isLast={i === todos.length - 1}
          />
        ))}
      </div>
      {isRunning && (
        <div
          className="mt-3 mx-2 px-3 py-2 rounded-md text-[11.5px] text-text-400 leading-relaxed"
          style={{
            background: "hsl(var(--bg-200) / 0.4)",
            border: "1px solid hsl(var(--border-300) / 0.08)",
          }}
        >
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-success-100 pulse-dot mr-2 align-middle" />
          {t("task.processTab.status.running")} ·{" "}
          {t("task.processTab.elapsed", { time: formatElapsed(elapsedSeconds) })}
        </div>
      )}
    </div>
  );
}
