import { ListTodo } from "lucide-react";
import type { Conversation } from "@/lib/data/types";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/**
 * Date is shown at increasing granularity the further back it is:
 *   - this calendar week → weekday ("Wed")
 *   - earlier this year  → month + day ("May 15")
 *   - a previous year    → year + month + day ("May 15, 2025")
 */
function startOfWeek(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // ISO-style week start (Monday). getDay(): 0=Sun..6=Sat.
  const sinceMonday = d.getDay() === 0 ? 6 : d.getDay() - 1;
  d.setDate(d.getDate() - sinceMonday);
  return d;
}

function formatTaskDate(ts: number, locale: string): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.getTime() >= startOfWeek(now).getTime()) {
    return d.toLocaleDateString(locale, { weekday: "short" });
  }
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface TaskListRowProps {
  conversation: Conversation;
  locale: string;
  selected: boolean;
  selectionMode: boolean;
  onOpen: () => void;
  onToggleSelect: () => void;
}

export function TaskListRow({
  conversation,
  locale,
  selected,
  selectionMode,
  onOpen,
  onToggleSelect,
}: TaskListRowProps) {
  return (
    <div className="group flex items-center gap-2">
      <Checkbox
        checked={selected}
        onCheckedChange={onToggleSelect}
        aria-label={conversation.title}
        className={cn(
          "shrink-0",
          selected || selectionMode
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100",
        )}
      />
      <button
        type="button"
        onClick={selectionMode ? onToggleSelect : onOpen}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
          selected ? "bg-state-selected" : "hover:bg-state-hover",
        )}
      >
        <ListTodo className="size-[18px] shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-[15px] text-foreground">
          {conversation.title}
        </span>
        <span className="shrink-0 text-sm text-muted-foreground">
          {formatTaskDate(conversation.updatedAt, locale)}
        </span>
      </button>
    </div>
  );
}
