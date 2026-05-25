import { InitialsAvatar } from "@/shared/atoms/InitialsAvatar";
import { cn } from "@/lib/utils";

interface SkillCardProps {
  /** 2-3 letter initials for the avatar tile. */
  initials: string;
  /** Hue token for the avatar background. */
  hue: "orange" | "blue" | "green" | "purple";
  name: string;
  description: string;
  /** Personal skills pass their parent directory absolute path; built-in
   *  skills omit this so the card stays compact. */
  sourcePath?: string;
  active?: boolean;
  onClick?: () => void;
}

export function SkillCard({
  initials,
  hue,
  name,
  description,
  sourcePath,
  active,
  onClick,
}: SkillCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 rounded-md px-2 py-2 text-left transition-colors",
        active ? "bg-muted" : "hover:bg-muted",
      )}
    >
      <InitialsAvatar initials={initials} hue={hue} size={28} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{name}</div>
        {sourcePath && (
          <div className="truncate font-mono text-[10.5px] text-muted-foreground/70">
            {sourcePath}
          </div>
        )}
        <div className="truncate text-xs text-muted-foreground">{description}</div>
      </div>
    </button>
  );
}
