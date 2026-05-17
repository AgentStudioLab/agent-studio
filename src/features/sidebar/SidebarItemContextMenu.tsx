import type { ReactNode } from "react";
import {
  Archive,
  FolderInput,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface SidebarItemContextMenuProps {
  /** "pin" for Recents row, "unpin" for Pinned row */
  pinMode: "pin" | "unpin";
  onPinToggle?: () => void;
  onRename?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
  onMoveToProject?: () => void;
  /** Custom trigger element. Defaults to a small "⋯" ghost button. */
  trigger?: ReactNode;
  /** Extra classes for the default trigger (e.g. opacity/group-hover). */
  triggerClassName?: string;
  /** Icon pixel size for the default trigger. Defaults to 16. */
  iconSize?: number;
  align?: "start" | "center" | "end";
}

/**
 * Sidebar item context menu — order matches prototype HTML 463-470:
 *   Move to project / --- / Pin · Rename / --- / Archive · Delete (danger)
 */
export function SidebarItemContextMenu({
  pinMode,
  onPinToggle,
  onRename,
  onArchive,
  onDelete,
  onMoveToProject,
  trigger,
  triggerClassName,
  iconSize = 16,
  align = "end",
}: SidebarItemContextMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            aria-label="More actions"
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent",
              triggerClassName,
            )}
          >
            <MoreHorizontal style={{ width: iconSize, height: iconSize }} />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-44">
        <DropdownMenuItem onSelect={onMoveToProject}>
          <FolderInput className="size-4" />
          Move to project
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onPinToggle}>
          {pinMode === "pin" ? <Pin className="size-4" /> : <PinOff className="size-4" />}
          {pinMode === "pin" ? "Pin" : "Unpin"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onRename}>
          <Pencil className="size-4" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onArchive}>
          <Archive className="size-4" />
          Archive
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onDelete} variant="destructive">
          <Trash2 className="size-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
