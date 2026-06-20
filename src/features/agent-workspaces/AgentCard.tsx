import { useTranslation } from "react-i18next";
import { BadgeCheck } from "lucide-react";
import type { AgentWorkspace } from "@/lib/data/types";
import { InitialsAvatar } from "@/shared/atoms/InitialsAvatar";
import { hueForAgent, initialsFromName } from "@/shared/atoms/agent-avatar";
import {
  AGENT_CATEGORY_META,
  agentCoverSrc,
  coverImageForAgent,
  normalizeAgentCategory,
} from "./agent-catalog";

interface AgentCardProps {
  agent: AgentWorkspace;
  onClick?: () => void;
}

export function AgentCard({ agent, onClick }: AgentCardProps) {
  const { t } = useTranslation();
  const category = normalizeAgentCategory(agent.category);
  const coverImage = coverImageForAgent(agent);
  const updatedAt = new Date(agent.updatedAt).toLocaleDateString();

  return (
    <button
      type="button"
      onClick={onClick}
      className="group grid aspect-[10/11] grid-rows-[3fr_2fr] overflow-hidden rounded-lg border border-border bg-card text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <span className="relative block min-h-0 overflow-hidden bg-muted">
        <img
          src={agentCoverSrc(coverImage)}
          alt=""
          className="size-full object-cover transition duration-300 group-hover:scale-[1.025]"
        />
        <span className="absolute inset-0 bg-gradient-to-t from-background/15 via-transparent to-background/5" />
        {agent.source === "builtin" && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-md bg-background/85 px-2 py-1 text-[11.5px] font-medium text-foreground shadow-sm backdrop-blur-md">
            <BadgeCheck className="size-3.5 text-primary" />
            {t("agents.official")}
          </span>
        )}
      </span>

      <span className="flex min-h-0 flex-col overflow-hidden p-4">
        <span className="flex min-w-0 items-start gap-3">
          <InitialsAvatar
            initials={initialsFromName(agent.name)}
            hue={hueForAgent(agent)}
            size={34}
            className="shrink-0 shadow-sm"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-medium leading-5 text-foreground">
              {agent.name}
            </span>
            <span className="mt-1 block truncate text-xs text-muted-foreground">
              {t("agents.updated", { date: updatedAt })}
            </span>
          </span>
        </span>

        <span className="mt-3 line-clamp-2 block text-[13px] leading-5 text-muted-foreground">
          {t(AGENT_CATEGORY_META[category].descriptionKey)}
        </span>
      </span>
    </button>
  );
}
