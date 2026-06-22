import { CheckCircle2, Circle, ListChecks, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
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

export function TaskTodosTrigger({ tasks }: TaskTodosTriggerProps) {
  const { t } = useTranslation();

  if (tasks.length === 0) {
    return null;
  }

  const completed = tasks.filter((task) => task.status === "completed").length;
  const active = tasks.find((task) => task.status === "in_progress");
  const activeText = active?.activeForm || active?.subject || null;
  const triggerLabel = t("task.todos.trigger", {
    completed,
    total: tasks.length,
  });

  return (
    <div className="mb-2 flex justify-center">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={triggerLabel}
            className="flex min-h-8 w-full items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-left text-[12.5px] text-foreground transition hover:bg-muted"
          >
            <ListChecks className="size-4 shrink-0 text-primary" />
            <span className="shrink-0 font-medium">{triggerLabel}</span>
            {activeText && (
              <span className="min-w-0 truncate text-muted-foreground">
                {t("task.todos.activePrefix")} · {activeText}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[min(720px,calc(100vw-32px))] p-3"
        >
          <PopoverHeader>
            <PopoverTitle>{t("task.todos.title")}</PopoverTitle>
          </PopoverHeader>
          <div className="max-h-[320px] overflow-y-auto pr-1">
            <div className="flex flex-col gap-1">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className={cn(
                    "flex gap-2 rounded-md px-2 py-2",
                    task.status === "in_progress"
                      ? "bg-primary/10"
                      : "bg-transparent",
                  )}
                >
                  <span className="mt-0.5 shrink-0">{statusIcon(task)}</span>
                  <div className="min-w-0 flex-1">
                    <div
                      className={cn(
                        "truncate text-[13px] font-medium",
                        task.status === "completed" &&
                          "text-muted-foreground line-through",
                      )}
                    >
                      {task.subject}
                    </div>
                    {task.description && (
                      <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted-foreground">
                        {task.description}
                      </div>
                    )}
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {t(`task.todos.status.${task.status}`)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
