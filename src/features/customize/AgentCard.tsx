import { cn } from "@/lib/utils";
import type { MockAgent } from "@/lib/mock/types";

interface AgentCardProps {
  agent: MockAgent;
  active?: boolean;
  onClick?: () => void;
}

export function AgentCard({ agent, active, onClick }: AgentCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-md px-2 py-2 text-left transition-colors",
        active ? "bg-muted" : "hover:bg-muted",
      )}
    >
      {/*
        Categorical primitive: agent emoji IS the agent's identity per PRD § 4.7.3,
        not decorative. design-tokens skill exception clause permits this.
      */}
      <div
        className="flex size-9 items-center justify-center rounded-full bg-muted text-xl"
        role="img"
        aria-label={agent.name}
      >
        {agent.emoji}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{agent.name}</div>
        <div className="truncate text-xs text-muted-foreground">
          {agent.description}
        </div>
      </div>
    </button>
  );
}
