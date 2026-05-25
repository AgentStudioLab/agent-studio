import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useThreadProgressPhases } from "@/lib/agui/react/useThreadProgressPhases";
import { useThreadRunMeta } from "@/lib/agui/react/useThreadRunMeta";
import type { PhaseEntry, PhaseId, PhaseStatus } from "@/lib/agui/runtime/derivations";
import type { ChatState } from "@/lib/agui/runtime/types";

interface ProcessTabProps {
  state: ChatState | null;
}

function formatElapsed(seconds: number): string {
  const mm = Math.floor(seconds / 60).toString().padStart(2, "0");
  const ss = (seconds % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function PhaseIndicator({ status }: { status: PhaseStatus }) {
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
  if (status === "active") {
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

/** Compose the per-phase secondary line shown beneath the label. */
function phaseDescription(
  phase: PhaseEntry,
  t: (k: string, opts?: Record<string, unknown>) => string,
): string {
  switch (phase.id) {
    case "context": {
      if (phase.count === 0) return t("task.processTab.phases.context.empty");
      return phase.lastToolLabel
        ? `${t("task.processTab.phases.context.summary", { count: phase.count })} · ${phase.lastToolLabel}`
        : t("task.processTab.phases.context.summary", { count: phase.count });
    }
    case "plan": {
      if (phase.count === 0) {
        return phase.status === "active"
          ? t("task.processTab.phases.plan.thinking")
          : t("task.processTab.phases.plan.empty");
      }
      return phase.lastToolLabel
        ? `${t("task.processTab.phases.plan.summary", { count: phase.count })} · ${phase.lastToolLabel}`
        : t("task.processTab.phases.plan.summary", { count: phase.count });
    }
    case "execute": {
      if (phase.count === 0) return t("task.processTab.phases.execute.empty");
      return phase.lastToolLabel
        ? `${t("task.processTab.phases.execute.summary", { count: phase.count })} · ${phase.lastToolLabel}`
        : t("task.processTab.phases.execute.summary", { count: phase.count });
    }
    case "finish": {
      return phase.status === "active"
        ? t("task.processTab.phases.finish.done")
        : t("task.processTab.phases.finish.waiting");
    }
  }
}

function PhaseRow({
  phase,
  isLast,
  t,
}: {
  phase: PhaseEntry;
  isLast: boolean;
  t: (k: string, opts?: Record<string, unknown>) => string;
}) {
  const labelKey: Record<PhaseId, string> = {
    context: "task.processTab.phases.context.label",
    plan: "task.processTab.phases.plan.label",
    execute: "task.processTab.phases.execute.label",
    finish: "task.processTab.phases.finish.label",
  };
  return (
    <div className="relative flex gap-3">
      <div className="flex flex-col items-center shrink-0">
        <PhaseIndicator status={phase.status} />
        {!isLast && (
          <div
            className="flex-1 w-px mt-1 mb-1 min-h-[28px]"
            style={{
              background:
                phase.status === "completed"
                  ? "hsl(var(--success-100) / 0.5)"
                  : "hsl(var(--border-300) / 0.2)",
            }}
          />
        )}
      </div>
      <div className="flex-1 min-w-0 pt-0.5 pb-5">
        <div
          className={cn(
            "text-[13px] leading-snug",
            phase.status === "active" && "text-text-100 font-medium",
            phase.status === "completed" && "text-text-200",
            phase.status === "pending" && "text-text-400",
          )}
        >
          {t(labelKey[phase.id])}
        </div>
        <div
          className={cn(
            "text-[11.5px] leading-snug mt-1 truncate",
            phase.status === "active" ? "text-text-300" : "text-text-400",
          )}
          title={phaseDescription(phase, t)}
        >
          {phaseDescription(phase, t)}
        </div>
      </div>
    </div>
  );
}

function ElapsedBanner({
  t,
  elapsedSeconds,
}: {
  t: (k: string, opts?: Record<string, unknown>) => string;
  elapsedSeconds: number;
}) {
  return (
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
  );
}

export function ProcessTab({ state }: ProcessTabProps) {
  const { t } = useTranslation();
  const { phases } = useThreadProgressPhases(state);
  const { elapsedSeconds, isRunning } = useThreadRunMeta(state);

  // Truly idle: every phase is pending AND none has activity yet.
  const isIdle =
    phases.length === 0 ||
    (phases.every((p) => p.status === "pending") &&
      phases.every((p) => p.count === 0));

  if (isIdle) {
    return (
      <div>
        <div className="px-6 py-12 text-center text-sm" style={{ color: "hsl(var(--text-300))" }}>
          {t("task.processTab.empty.notStarted")}
        </div>
        {isRunning && <ElapsedBanner t={t} elapsedSeconds={elapsedSeconds} />}
      </div>
    );
  }

  const completedCount = phases.filter((p) => p.status === "completed").length;
  return (
    <div>
      <div className="flex items-center justify-between px-2 pt-3 pb-3">
        <span className="text-[11px] tracking-wider uppercase text-text-400">
          {t("task.processTab.phases.progress")}
        </span>
        <span className="text-[11.5px] text-text-300 font-mono">
          {t("task.processTab.countOf", { done: completedCount, total: phases.length })}
        </span>
      </div>
      <div className="px-2">
        {phases.map((phase, i) => (
          <PhaseRow
            key={phase.id}
            phase={phase}
            isLast={i === phases.length - 1}
            t={t}
          />
        ))}
      </div>
      {isRunning && <ElapsedBanner t={t} elapsedSeconds={elapsedSeconds} />}
    </div>
  );
}
