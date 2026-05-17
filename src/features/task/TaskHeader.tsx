import {
  ChevronDown,
  Calendar,
  Wand2,
  FolderInput,
  Pin,
  Pencil,
  Archive,
  Trash2,
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
  return (
    <header className="flex items-center gap-2 px-6 py-4">
      <h1 className="min-w-0 flex-1 truncate font-serif text-2xl font-semibold text-foreground">
        {title}
      </h1>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Task menu"
          className="rounded-md p-1 text-muted-foreground outline-hidden hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
        >
          <ChevronDown className="size-5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
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
    </header>
  );
}
