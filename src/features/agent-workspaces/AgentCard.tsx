import { useTranslation } from "react-i18next";
import type { AgentWorkspace } from "@/lib/data/types";
import { InitialsAvatar } from "@/shared/atoms/InitialsAvatar";
import { hueForAgent, initialsFromName } from "@/shared/atoms/agent-avatar";

interface AgentCardProps {
  agent: AgentWorkspace;
  onClick?: () => void;
}

export function AgentCard({ agent, onClick }: AgentCardProps) {
  const { t } = useTranslation();
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
      <div className="flex items-center gap-2">
        {agent.source === "builtin" && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {t("agentSpace.builtinBadge")}
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          {new Date(agent.updatedAt).toLocaleDateString()}
        </span>
      </div>
    </button>
  );
}
