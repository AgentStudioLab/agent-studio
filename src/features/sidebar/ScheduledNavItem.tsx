import { cn } from "@/lib/utils";
import { StatusDot } from "@/shared/atoms/StatusDot";
import type { Status } from "@/lib/mock/types";

interface ScheduledNavItemProps {
  name: string;
  status: Status;
  /** Frequency label (e.g. "Daily"), shown when there are no new runs. */
  frequencyLabel: string;
  /** Count of unviewed runs; when > 0 a "N new" badge replaces the frequency. */
  newCount?: number;
  newLabel?: string;
  active?: boolean;
  onClick?: () => void;
}

export function ScheduledNavItem({
  name,
  status,
  frequencyLabel,
  newCount = 0,
  newLabel,
  active,
  onClick,
}: ScheduledNavItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md py-1 pl-2.5 pr-3 text-left text-[13px] transition-colors",
        active
          ? "bg-state-selected text-[hsl(var(--text-100))]"
          : "text-[hsl(var(--text-200))] hover:bg-state-hover hover:text-[hsl(var(--text-100))]",
      )}
    >
      <span className="flex size-3 shrink-0 items-center justify-center">
        <StatusDot status={status} size={12} />
      </span>
      <span className="min-w-0 flex-1 truncate text-left">{name}</span>
      <span
        className={cn(
          "shrink-0 text-[12px]",
          newCount > 0
            ? "font-medium text-[hsl(var(--text-200))]"
            : "text-[hsl(var(--text-400))]",
        )}
      >
        {newCount > 0 ? newLabel : frequencyLabel}
      </span>
    </button>
  );
}
