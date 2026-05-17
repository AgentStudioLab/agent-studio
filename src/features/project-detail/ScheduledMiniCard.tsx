import { Clock, Plus } from "lucide-react";
import { CollapsibleCard } from "@/features/project-detail/CollapsibleCard";
import { scheduledTasks } from "@/lib/mock/scheduled";
import type { Frequency } from "@/lib/mock/types";

interface ScheduledMiniCardProps {
  scheduledTaskIds?: string[];
  onAdd?: () => void;
}

const FREQUENCY_LABEL: Record<Frequency, string> = {
  manual: "Manual",
  hourly: "Hourly",
  daily: "Daily",
  weekdays: "Weekdays",
  weekly: "Weekly",
};

export function ScheduledMiniCard({ scheduledTaskIds, onAdd }: ScheduledMiniCardProps) {
  const tasks = (scheduledTaskIds ?? [])
    .map((id) => scheduledTasks.find((t) => t.id === id))
    .filter((t): t is (typeof scheduledTasks)[number] => Boolean(t));

  return (
    <CollapsibleCard
      title="Scheduled"
      action={
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Plus className="size-3" /> Add
        </button>
      }
    >
      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No scheduled tasks yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
            >
              <Clock className="size-4 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {task.name}
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {FREQUENCY_LABEL[task.frequency]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </CollapsibleCard>
  );
}
