import { cn } from "@/lib/utils";
import type { AgentCoverImage } from "@/lib/data/types";
import { agentCoverSrc } from "./agent-catalog";

interface AgentCategoryChoiceProps {
  category: AgentCoverImage;
  label: string;
  description: string;
  selected: boolean;
  onClick: () => void;
  role: "radio" | "tab";
  count?: number;
  className?: string;
}

export function AgentCategoryChoice({
  category,
  label,
  description,
  selected,
  onClick,
  role,
  count,
  className,
}: AgentCategoryChoiceProps) {
  const stateProps =
    role === "tab"
      ? { "aria-selected": selected }
      : { "aria-checked": selected };

  return (
    <button
      type="button"
      role={role}
      onClick={onClick}
      className={cn(
        "group flex min-h-14 items-center gap-3 rounded-lg border border-border bg-card p-2 text-left outline-hidden transition hover:bg-state-hover focus-visible:ring-1 focus-visible:ring-ring",
        selected && "border-primary bg-accent",
        className,
      )}
      {...stateProps}
    >
      <img
        src={agentCoverSrc(category)}
        alt=""
        className="size-10 shrink-0 rounded-md object-cover"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium text-foreground">
          {label}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {description}
        </span>
      </span>
      {count !== undefined && (
        <span className="shrink-0 rounded-md bg-bg-200 px-1.5 py-0.5 text-[11px] text-muted-foreground">
          {count}
        </span>
      )}
    </button>
  );
}
