import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MockRecentItem } from "@/lib/mock/types";
import { StatusDot } from "@/features/_atoms/StatusDot";
import { SidebarItemContextMenu } from "@/features/sidebar/SidebarItemContextMenu";

interface RecentItemProps {
  item: MockRecentItem;
  onClick?: () => void;
  onPin?: () => void;
  onRename?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
  onMoveToProject?: () => void;
}

export function RecentItem({
  item,
  onClick,
  onPin,
  onRename,
  onArchive,
  onDelete,
  onMoveToProject,
}: RecentItemProps) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-md px-2 py-1.5",
        "hover:bg-sidebar-accent",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
      >
        <span className="shrink-0">
          {item.kind === "task" && item.status ? (
            <StatusDot status={item.status} size={14} />
          ) : (
            <MessageSquare className="size-3.5 text-muted-foreground" />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate">{item.title}</span>
        <span className="shrink-0 text-xs text-muted-foreground group-hover:hidden">
          {item.time}
        </span>
      </button>
      <SidebarItemContextMenu
        pinMode="pin"
        onPinToggle={onPin}
        onRename={onRename}
        onArchive={onArchive}
        onDelete={onDelete}
        onMoveToProject={onMoveToProject}
        triggerClassName="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
      />
    </div>
  );
}
