import { useState } from "react";
import {
  BookOpen,
  Check,
  ChevronDown,
  FileText,
  Sparkles,
  Terminal,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { TimelineIconName, TimelineStep, TimelineSubStep } from "@/lib/mock/types";

const ICON_MAP: Record<TimelineIconName, LucideIcon> = {
  wrench: Wrench,
  file: FileText,
  terminal: Terminal,
  "agent-run": Sparkles,
  "book-open": BookOpen,
};

function StepIcon({ name, size }: { name: TimelineIconName; size: number }) {
  const Icon = ICON_MAP[name];
  return <Icon size={size} strokeWidth={1.6} />;
}

/* ------------------ ToolCallSubStep ------------------ */
interface ToolCallSubStepProps {
  step: TimelineSubStep;
  isLast: boolean;
}

function ToolCallSubStep({ step, isLast }: ToolCallSubStepProps) {
  return (
    <div className="relative flex gap-3">
      <div className="flex shrink-0 flex-col items-center">
        <div
          className="mt-0.5 flex h-4 w-4 items-center justify-center"
          style={{ color: "hsl(var(--text-400))" }}
        >
          <StepIcon name={step.icon} size={12} />
        </div>
        {!isLast && (
          <div
            className="mt-0.5 w-px min-h-[6px] flex-1"
            style={{ background: "hsl(var(--border-300) / 0.15)" }}
          />
        )}
      </div>
      <div
        className="pb-2 text-[12.5px]"
        style={{ color: "hsl(var(--text-300))" }}
      >
        {step.title}
      </div>
    </div>
  );
}

/* ------------------ ToolCallStep ------------------ */
interface ToolCallStepProps {
  step: TimelineStep;
  isLast: boolean;
}

function ToolCallStep({ step, isLast }: ToolCallStepProps) {
  const [subOpen, setSubOpen] = useState(true);
  const hasSub = !!step.subSteps && step.subSteps.length > 0;

  const chipStyle =
    step.chipVariant === "danger"
      ? {
          background: "hsl(var(--danger-100) / 0.18)",
          color: "hsl(var(--danger-100))",
        }
      : {
          background: "hsl(var(--bg-300))",
          color: "hsl(var(--text-300))",
        };

  return (
    <div className="relative flex gap-3">
      <div className="flex shrink-0 flex-col items-center">
        <div
          className="mt-0.5 flex h-6 w-6 items-center justify-center"
          style={{ color: "hsl(var(--text-300))" }}
        >
          <StepIcon name={step.icon} size={16} />
        </div>
        {!isLast && (
          <div
            className="mt-1 w-px min-h-[14px] flex-1"
            style={{ background: "hsl(var(--border-300) / 0.2)" }}
          />
        )}
      </div>
      <div className="min-w-0 flex-1 pb-3">
        <div className="flex items-center gap-2 pt-1">
          <span
            className="text-[13.5px] leading-tight"
            style={{ color: "hsl(var(--text-200))" }}
          >
            {step.title}
          </span>
          {hasSub && (
            <button
              type="button"
              onClick={() => setSubOpen((v) => !v)}
              className="ml-auto flex items-center gap-1 text-[11.5px] transition-colors"
              style={{ color: "hsl(var(--text-400))" }}
            >
              {step.subSteps!.length} steps
              <ChevronDown
                size={9}
                className={
                  "transition-transform " + (subOpen ? "" : "-rotate-90")
                }
              />
            </button>
          )}
        </div>
        {step.chip && (
          <div className="mt-1.5">
            <span
              className="inline-block rounded-md px-2 py-0.5 font-mono text-[10.5px]"
              style={chipStyle}
            >
              {step.chip}
            </span>
          </div>
        )}
        {hasSub && subOpen && (
          <div className="mt-2 flex flex-col">
            {step.subSteps!.map((sub, i) => (
              <ToolCallSubStep
                key={i}
                step={sub}
                isLast={i === step.subSteps!.length - 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------ ToolCallTimeline ------------------ */
interface ToolCallTimelineProps {
  summary: string;
  steps: TimelineStep[];
  defaultOpen?: boolean;
}

export function ToolCallTimeline({
  summary,
  steps,
  defaultOpen = true,
}: ToolCallTimelineProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className="rounded-xl p-5"
      style={{
        background: "hsl(var(--bg-200) / 0.35)",
        border: "1px solid hsl(var(--border-300) / 0.08)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
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
            <ToolCallStep
              key={i}
              step={s}
              isLast={i === steps.length - 1}
            />
          ))}
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
        </div>
      )}
    </div>
  );
}
