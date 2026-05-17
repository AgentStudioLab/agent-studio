import { ChevronRight } from "lucide-react";
import { InitialsAvatar } from "@/features/_atoms/InitialsAvatar";
import { cn } from "@/lib/utils";
import type { MockSkill } from "@/lib/mock/types";

interface SkillCardProps {
  skill: MockSkill;
  active?: boolean;
  expanded?: boolean;
  onClick?: () => void;
  /** child files (e.g., for skill-creator's nested layout) — only rendered when expanded */
  childFiles?: string[];
}

export function SkillCard({
  skill,
  active,
  expanded,
  onClick,
  childFiles,
}: SkillCardProps) {
  const hasChildren = !!childFiles && childFiles.length > 0;
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex items-center gap-3 rounded-md px-2 py-2 text-left transition-colors",
          active ? "bg-muted" : "hover:bg-muted",
        )}
      >
        <InitialsAvatar initials={skill.initials} hue={skill.hue} size={28} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-foreground">{skill.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {skill.description}
          </div>
        </div>
        {hasChildren && (
          <ChevronRight
            className={cn(
              "size-3.5 text-muted-foreground transition-transform",
              expanded && "rotate-90",
            )}
          />
        )}
      </button>
      {expanded && hasChildren && (
        <ul className="mt-1 flex flex-col gap-0.5 border-l border-border pl-4">
          {childFiles!.map((file) => (
            <li
              key={file}
              className="rounded-sm px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {file}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
