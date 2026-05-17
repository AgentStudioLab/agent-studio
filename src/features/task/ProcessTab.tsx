import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { StatusDot } from "@/shared/atoms/StatusDot";
import type { MockTask } from "@/lib/mock/types";

interface ProcessTabProps {
  task: MockTask;
}

function formatElapsed(seconds: number): string {
  const mm = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const ss = (seconds % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

const STATUS_LABEL: Record<MockTask["status"], string> = {
  running: "Task running",
  done: "Task complete",
  failed: "Task failed",
  paused: "Task paused",
};

const STATUS_DOT_STATE: Record<
  MockTask["status"],
  "active" | "done" | "failed" | "pending"
> = {
  running: "active",
  done: "done",
  failed: "failed",
  paused: "pending",
};

export function ProcessTab({ task }: ProcessTabProps) {
  const [elapsed, setElapsed] = useState(task.elapsedSeconds);

  useEffect(() => {
    setElapsed(task.elapsedSeconds);
  }, [task.elapsedSeconds]);

  useEffect(() => {
    if (task.status !== "running") return;
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [task.status]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Plan
        </h3>
        <ol className="flex flex-col gap-2">
          {task.plan.map((step) => (
            <li key={step.id} className="flex items-start gap-2">
              <StatusDot status={step.status} size={20} className="mt-0.5" />
              <span
                className={cn(
                  "text-sm",
                  step.status === "active"
                    ? "font-medium text-foreground"
                    : "text-foreground",
                  step.status === "pending" && "text-muted-foreground"
                )}
              >
                {step.description}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <div className="flex items-center gap-2 border-t border-border px-4 py-2 text-xs text-muted-foreground">
        <StatusDot status={STATUS_DOT_STATE[task.status]} size={10} />
        <span>{STATUS_LABEL[task.status]}</span>
        <span>·</span>
        <span className="font-mono tabular-nums">
          {formatElapsed(elapsed)} elapsed
        </span>
      </div>
    </div>
  );
}
