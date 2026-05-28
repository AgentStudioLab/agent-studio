import { useTranslation } from "react-i18next";
import {
  CirclePause,
  CirclePlay,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Frequency } from "@/lib/data/types";
import { FrequencyChip } from "@/features/scheduled/FrequencyChip";

interface ScheduledCardProps {
  task: {
    name: string;
    description: string;
    frequency: Frequency;
    timeOfDay?: string | null;
  };
  /** Drives the Paused chip + the Enable/Disable menu item. */
  enabled?: boolean;
  /** When true, a spawned run is paused awaiting the user's approval. */
  needsAttention?: boolean;
  needsAttentionLabel?: string;
  onClick?: () => void;
  onRunNow?: () => void;
  onToggleEnabled?: (next: boolean) => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function ScheduledCard({
  task,
  enabled,
  needsAttention,
  needsAttentionLabel,
  onClick,
  onRunNow,
  onToggleEnabled,
  onEdit,
  onDelete,
}: ScheduledCardProps) {
  const { t } = useTranslation();
  const hasMenu = !!(onRunNow || onToggleEnabled || onEdit || onDelete);
  const isPaused = enabled === false;

  return (
    <div className="group relative rounded-lg border border-border bg-card transition-colors hover:bg-muted focus-within:ring-1 focus-within:ring-ring">
      <button
        type="button"
        onClick={onClick}
        className="flex w-full flex-col items-start gap-3 rounded-lg p-5 pr-10 text-left focus-visible:outline-none"
      >
        <div className="space-y-1">
          <h3 className="text-base font-medium text-foreground">{task.name}</h3>
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {task.description}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isPaused ? (
            <span className="inline-flex items-center gap-1.5 rounded-sm bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              <Pause className="size-3" />
              {t("scheduled.card.paused")}
            </span>
          ) : (
            <FrequencyChip
              frequency={task.frequency}
              timeOfDay={task.timeOfDay ?? undefined}
            />
          )}
          {needsAttention && (
            <span className="rounded-sm bg-[hsl(var(--warning-100)/0.15)] px-2 py-0.5 text-xs text-[hsl(var(--warning-100))]">
              {needsAttentionLabel}
            </span>
          )}
        </div>
      </button>

      {hasMenu && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              aria-label={t("scheduled.menu.moreActions")}
              className="absolute right-2.5 top-2.5 flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-state-hover hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onSelect={() => onRunNow?.()}>
              <Play className="size-4" />
              {t("scheduled.menu.runNow")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onToggleEnabled?.(isPaused)}>
              {isPaused ? (
                <CirclePlay className="size-4" />
              ) : (
                <CirclePause className="size-4" />
              )}
              {isPaused ? t("scheduled.menu.enable") : t("scheduled.menu.disable")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onEdit?.()}>
              <Pencil className="size-4" />
              {t("scheduled.menu.edit")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onDelete?.()} variant="destructive">
              <Trash2 className="size-4" />
              {t("scheduled.menu.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
