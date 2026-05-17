import {
  ChevronDown,
  Calendar,
  Wand2,
  FolderInput,
  Pin,
  Pencil,
  Archive,
  Trash2,
  PanelRight,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { useAppShell } from "@/app/AppShellContext";
import { projects as mockProjects } from "@/lib/mock/projects";

interface TaskHeaderProps {
  title: string;
  projects?: { id: string; name: string }[];
  onSchedule?: () => void;
  onTurnIntoSkill?: () => void;
  onMoveToProject?: (projectId: string) => void;
  onPin?: () => void;
  onRename?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
}

export function TaskHeader({
  title,
  projects = mockProjects,
  onSchedule,
  onTurnIntoSkill,
  onMoveToProject,
  onPin,
  onRename,
  onArchive,
  onDelete,
}: TaskHeaderProps) {
  const { toggleAside } = useAppShell();
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 px-6">
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Task menu"
          className="inline-flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-[14px] font-medium text-foreground outline-hidden hover:bg-muted focus-visible:ring-1 focus-visible:ring-ring"
        >
          <span className="truncate">{title}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem onSelect={onSchedule}>
            <Calendar /> Schedule
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onTurnIntoSkill}>
            <Wand2 /> Turn into skill
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FolderInput /> Move to project
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {projects.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  onSelect={() => onMoveToProject?.(p.id)}
                >
                  {p.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onSelect={onPin}>
            <Pin /> Pin
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onRename}>
            <Pencil /> Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onArchive}>
            <Archive /> Archive
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="flex-1" />
      <button
        type="button"
        onClick={toggleAside}
        aria-label="Toggle right panel"
        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <PanelRight className="size-4" />
      </button>
    </header>
  );
}
