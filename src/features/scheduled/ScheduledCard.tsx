import type { MockScheduledTask } from "@/lib/mock/types";
import { FrequencyChip } from "@/features/scheduled/FrequencyChip";

interface ScheduledCardProps {
  task: MockScheduledTask;
  onClick?: () => void;
}

export function ScheduledCard({ task, onClick }: ScheduledCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start gap-3 rounded-lg border border-border bg-card p-5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <div className="space-y-1">
        <h3 className="text-base font-medium text-foreground">{task.name}</h3>
        <p className="line-clamp-2 text-sm text-muted-foreground">{task.description}</p>
      </div>
      <FrequencyChip frequency={task.frequency} timeOfDay={task.timeOfDay} />
    </button>
  );
}
