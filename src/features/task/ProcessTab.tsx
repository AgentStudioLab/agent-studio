import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { MockTask, PlanStep, StepStatus } from "@/lib/mock/types";

interface ProcessTabProps {
  task?: MockTask | null;
}

function formatElapsed(seconds: number): string {
  const mm = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const ss = (seconds % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

const STATUS_KEY: Record<MockTask["status"], string> = {
  running: "task.processTab.status.running",
  done: "task.processTab.status.done",
  failed: "task.processTab.status.failed",
  paused: "task.processTab.status.paused",
};

interface ProcessStepProps {
  status: StepStatus;
  name: string;
  desc?: string;
  isLast: boolean;
}

function StepIndicator({ status }: { status: StepStatus }) {
  if (status === "done") {
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
  if (status === "failed") {
    return (
      <span
        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
        style={{ background: "hsl(var(--danger-100))" }}
      >
        <svg
          width="9"
          height="9"
          viewBox="0 0 24 24"
          fill="none"
          stroke="hsl(var(--oncolor-100))"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </span>
    );
  }
  // pending
  return (
    <span
      className="w-6 h-6 rounded-full shrink-0"
      style={{ border: "1.5px dashed hsl(var(--text-400) / 0.4)" }}
    />
  );
}

function ProcessStep({ status, name, desc, isLast }: ProcessStepProps) {
  return (
    <div className="relative flex gap-3">
      <div className="flex flex-col items-center shrink-0">
        <StepIndicator status={status} />
        {!isLast && (
          <div
            className="flex-1 w-px mt-1 mb-1 min-h-[18px]"
            style={{
              background:
                status === "done"
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
            status === "active" && "text-text-100 font-medium",
            status === "done" && "text-text-200",
            status === "failed" && "text-danger-100",
            status === "pending" && "text-text-400"
          )}
        >
          {name}
        </div>
        {desc && (
          <div
            className={cn(
              "text-[11.5px] mt-1 leading-relaxed",
              status === "active" ? "text-text-300" : "text-text-400"
            )}
          >
            {status === "active" && (
              <span className="inline-flex w-1 h-1 rounded-full bg-brand-100 pulse-dot mr-1.5 align-middle" />
            )}
            {desc}
          </div>
        )}
      </div>
    </div>
  );
}

export function ProcessTab({ task }: ProcessTabProps) {
  const { t } = useTranslation();
  const [elapsed, setElapsed] = useState(task?.elapsedSeconds ?? 0);

  useEffect(() => {
    setElapsed(task?.elapsedSeconds ?? 0);
  }, [task?.elapsedSeconds]);

  useEffect(() => {
    if (task?.status !== "running") return;
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [task?.status]);

  const steps: PlanStep[] = task?.plan ?? [];

  if (steps.length === 0) {
    return (
      <div className="px-6 py-12 text-center text-sm" style={{ color: "hsl(var(--text-300))" }}>
        {t("task.rightPanel.empty")}
      </div>
    );
  }

  const doneCount = steps.filter((s) => s.status === "done").length;
  const totalCount = steps.length;

  return (
    <div>
      <div className="flex items-center justify-between px-2 pt-3 pb-3">
        <span className="text-[11px] tracking-wider uppercase text-text-400">{t("task.processTab.plan")}</span>
        <span className="text-[11.5px] text-text-300 font-mono">
          {t("task.processTab.countOf", { done: doneCount, total: totalCount })}
        </span>
      </div>
      <div className="px-2">
        {steps.map((step, i) => (
          <ProcessStep
            key={step.id}
            status={step.status}
            name={step.description}
            desc={step.detail}
            isLast={i === steps.length - 1}
          />
        ))}
      </div>
      {task && (
        <div
          className="mt-3 mx-2 px-3 py-2 rounded-md text-[11.5px] text-text-400 leading-relaxed"
          style={{
            background: "hsl(var(--bg-200) / 0.4)",
            border: "1px solid hsl(var(--border-300) / 0.08)",
          }}
        >
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-success-100 pulse-dot mr-2 align-middle" />
          {t(STATUS_KEY[task.status])} · {t("task.processTab.elapsed", { time: formatElapsed(elapsed) })}
        </div>
      )}
    </div>
  );
}
