import { ListTodo } from "lucide-react";
import type { Conversation } from "@/lib/data/types";
import { SidebarItemContextMenu } from "@/features/sidebar/SidebarItemContextMenu";

/** "Wed" for the last week, "May 15" beyond it — matches the reference list. */
function formatTaskDate(ts: number, locale: string): string {
  const d = new Date(ts);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days >= 0 && days < 7) {
    return d.toLocaleDateString(locale, { weekday: "short" });
  }
  return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

interface TaskListRowProps {
  conversation: Conversation;
  locale: string;
  onOpen: () => void;
  onPinToggle: () => void;
  onRename: () => void;
  onArchiveToggle: () => void;
  onDelete: () => void;
}

export function TaskListRow({
  conversation,
  locale,
  onOpen,
  onPinToggle,
  onRename,
  onArchiveToggle,
  onDelete,
}: TaskListRowProps) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted"
      >
        <ListTodo className="size-[18px] shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-[15px] text-foreground">
          {conversation.title}
        </span>
        {/* pr-6 reserves the slot the hover ⋯ menu drops into, so the date
            never jumps or gets covered. */}
        <span className="shrink-0 pr-6 text-sm text-muted-foreground">
          {formatTaskDate(conversation.updatedAt, locale)}
        </span>
      </button>
      <SidebarItemContextMenu
        pinMode={conversation.pinned ? "unpin" : "pin"}
        archived={conversation.archived}
        onPinToggle={onPinToggle}
        onRename={onRename}
        onArchive={onArchiveToggle}
        onDelete={onDelete}
        triggerClassName="absolute right-2 top-1/2 -translate-y-1/2 size-auto p-1 rounded text-[hsl(var(--text-400))] hover:bg-[hsl(var(--bg-200))] hover:text-[hsl(var(--text-100))] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
        iconSize={16}
      />
    </div>
  );
}
