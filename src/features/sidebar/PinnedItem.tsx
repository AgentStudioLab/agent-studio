import { FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MockPinnedItem } from "@/lib/mock/types";
import { SidebarItemContextMenu } from "@/features/sidebar/SidebarItemContextMenu";

interface PinnedItemProps {
  item: MockPinnedItem;
  onClick?: () => void;
  onUnpin?: () => void;
  onRename?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
  onMoveToProject?: () => void;
}

export function PinnedItem({
  item,
  onClick,
  onUnpin,
  onRename,
  onArchive,
  onDelete,
  onMoveToProject,
}: PinnedItemProps) {
  const isProject = item.kind === "project";
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
        {isProject ? (
          <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <span
            aria-hidden
            className="inline-block size-2 shrink-0 rounded-full border border-[hsl(var(--text-400))]"
          />
        )}
        <span className={cn("truncate", isProject && "font-semibold")}>{item.name}</span>
      </button>
      <SidebarItemContextMenu
        pinMode="unpin"
        onPinToggle={onUnpin}
        onRename={onRename}
        onArchive={onArchive}
        onDelete={onDelete}
        onMoveToProject={onMoveToProject}
        triggerClassName="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
      />
    </div>
  );
}
