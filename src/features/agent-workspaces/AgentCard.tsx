import type { AgentWorkspace } from "@/lib/data/types";
import { InitialsAvatar } from "@/shared/atoms/InitialsAvatar";
import { hueForAgent, initialsFromName } from "@/shared/atoms/agent-avatar";

interface AgentCardProps {
  agent: AgentWorkspace;
  onClick?: () => void;
}

export function AgentCard({ agent, onClick }: AgentCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start gap-3 rounded-lg border border-border bg-card p-6 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <InitialsAvatar
        initials={initialsFromName(agent.name)}
        hue={hueForAgent(agent)}
        size={40}
      />
      <h3 className="font-serif text-[22px] font-medium leading-tight text-foreground">
        {agent.name}
      </h3>
      <span className="text-xs text-muted-foreground">
        {new Date(agent.updatedAt).toLocaleDateString()}
      </span>
    </button>
  );
}
