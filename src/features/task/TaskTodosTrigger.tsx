import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import type { AgentTask } from "@/lib/agui/runtime/types";

interface TaskTodosTriggerProps {
  tasks: AgentTask[];
}

function statusIcon(task: AgentTask) {
  if (task.status === "completed") {
    return <CheckCircle2 className="size-4 text-success-100" />;
  }

  if (task.status === "in_progress") {
    return <Loader2 className="size-4 animate-spin text-primary" />;
  }

  return <Circle className="size-4 text-muted-foreground" />;
}

function ProgressRing({ completed, total }: { completed: number; total: number }) {
  const radius = 5;
  const circumference = 2 * Math.PI * radius;
  const ratio = total > 0 ? Math.min(Math.max(completed / total, 0), 1) : 0;
  const dashOffset = circumference * (1 - ratio);

  return (
    <svg
      aria-hidden="true"
      className="size-4 shrink-0 -rotate-90 text-primary"
      viewBox="0 0 16 16"
    >
      <circle
        cx="8"
        cy="8"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.18"
        strokeWidth="2"
      />
      <circle
        cx="8"
        cy="8"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function TaskTodosTrigger({ tasks }: TaskTodosTriggerProps) {
  const { t } = useTranslation();

  if (tasks.length === 0) {
    return null;
  }

  const completed = tasks.filter((task) => task.status === "completed").length;
  const active = tasks.some((task) => task.status === "in_progress");
  const current = Math.min(completed + (active ? 1 : 0), tasks.length);
  const triggerLabel = t("task.todos.trigger", {
    completed,
    total: tasks.length,
  });
  const stepLabel = t("task.todos.step", {
    current,
    total: tasks.length,
  });

  return (
    <div className="mb-2 flex justify-center">
      <HoverCard openDelay={80} closeDelay={120}>
        <HoverCardTrigger asChild>
          <button
            type="button"
            aria-label={stepLabel}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-[12.5px] text-foreground shadow-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ProgressRing completed={completed} total={tasks.length} />
            <span className="shrink-0 text-muted-foreground">{stepLabel}</span>
            <span className="sr-only">{triggerLabel}</span>
          </button>
        </HoverCardTrigger>
        <HoverCardContent
          align="center"
          side="top"
          sideOffset={8}
          className="w-[min(320px,calc(100vw_-_32px))] p-1.5"
        >
          <div className="max-h-[320px] overflow-y-auto">
            <div className="flex flex-col">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className={cn(
                    "flex gap-2 rounded-md px-1.5 py-1.5",
                    task.status === "in_progress"
                      ? "bg-muted/70"
                      : "bg-transparent",
                  )}
                >
                  <span className="mt-0.5 shrink-0 text-muted-foreground">
                    {statusIcon(task)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div
                      className={cn(
                        "text-[13px] leading-snug text-muted-foreground",
                        task.status === "in_progress" && "text-foreground",
                        task.status === "completed" &&
                          "text-muted-foreground",
                      )}
                    >
                      {task.subject}
                    </div>
                    {task.description && (
                      <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted-foreground">
                        {task.description}
                      </div>
                    )}
                    <span className="sr-only">
                      {t(`task.todos.status.${task.status}`)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </HoverCardContent>
      </HoverCard>
    </div>
  );
}
