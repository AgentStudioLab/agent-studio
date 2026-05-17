import { useState } from "react";
import { Circle, FolderOpen, MoreHorizontal, Pencil, Plus } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { InitialsAvatar } from "@/features/_atoms/InitialsAvatar";
import { cn } from "@/lib/utils";
import { loadedSkills } from "@/lib/mock/skills";
import { mcpServers } from "@/lib/mock/mcp-servers";
import { projects } from "@/lib/mock/projects";
import type { MockAgent, MockSkill } from "@/lib/mock/types";

interface AgentDetailProps {
  agent: MockAgent;
}

export function AgentDetail({ agent }: AgentDetailProps) {
  const [enabled, setEnabled] = useState(true);

  const projectChips = (() => {
    if (
      agent.allowedProjects === "all" ||
      (Array.isArray(agent.allowedProjects) && agent.allowedProjects.length === 0)
    ) {
      return null;
    }
    return agent.allowedProjects as string[];
  })();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start gap-4">
        {/*
          Categorical primitive: agent emoji IS the agent's identity per PRD § 4.7.3,
          not decorative. design-tokens skill exception clause permits this.
        */}
        <div
          className="flex size-14 shrink-0 items-center justify-center rounded-full bg-muted text-3xl"
          role="img"
          aria-label={agent.name}
        >
          {agent.emoji}
        </div>
        <div className="flex-1 space-y-1">
          <h1 className="font-serif text-2xl font-semibold text-foreground">
            {agent.name}
          </h1>
          <p className="text-sm text-muted-foreground">{agent.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            aria-label="Enabled"
          />
          <button
            type="button"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="More"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </div>
      </header>

      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Added by</dt>
        <dd className="text-foreground">
          {agent.category === "my" ? "You" : "Anthropic"}
        </dd>
        <dt className="text-muted-foreground">Trigger</dt>
        <dd className="text-foreground">Manual + auto-suggest</dd>
      </dl>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            System prompt
          </h2>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Pencil className="size-3" /> Edit
          </button>
        </div>
        <p className="font-serif text-sm italic text-foreground">
          {agent.systemPrompt}
        </p>
      </section>

      <ChipSection
        title={`Allowed skills (${agent.skills.length})`}
        action="Add skill"
      >
        {agent.skills.map((skillId) => {
          const skill: MockSkill | undefined = loadedSkills.find(
            (s) => s.id === skillId,
          );
          return skill ? (
            <SkillChip
              key={skillId}
              initials={skill.initials}
              hue={skill.hue}
              name={skill.name}
            />
          ) : (
            <SkillChip
              key={skillId}
              initials={skillId.slice(0, 2).toUpperCase()}
              hue="stone"
              name={skillId}
            />
          );
        })}
      </ChipSection>

      <ChipSection
        title={`MCP servers (${agent.mcpServers.length})`}
        action="Add server"
      >
        {agent.mcpServers.map((serverId) => {
          const server = mcpServers.find((s) => s.id === serverId);
          const connected = server?.connected ?? false;
          return (
            <span
              key={serverId}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-foreground"
            >
              <Circle
                className={cn(
                  "size-2 fill-current",
                  connected
                    ? "text-[hsl(var(--success-100))]"
                    : "text-muted-foreground",
                )}
              />
              {server?.name ?? serverId}
            </span>
          );
        })}
      </ChipSection>

      <ChipSection title="Allowed projects" action="Add project">
        {projectChips === null ? (
          <span className="text-xs italic text-muted-foreground">
            All projects (no restriction)
          </span>
        ) : (
          projectChips.map((projectId) => {
            const project = projects.find((p) => p.id === projectId);
            return (
              <span
                key={projectId}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-foreground"
              >
                <FolderOpen className="size-3 text-muted-foreground" />
                {project?.name ?? projectId}
              </span>
            );
          })
        )}
      </ChipSection>
    </div>
  );
}

interface ChipSectionProps {
  title: string;
  action: string;
  children: React.ReactNode;
}

function ChipSection({ title, action, children }: ChipSectionProps) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Plus className="size-3" />
          {action}
        </button>
      </div>
    </section>
  );
}

interface SkillChipProps {
  initials: string;
  hue: MockSkill["hue"];
  name: string;
}

function SkillChip({ initials, hue, name }: SkillChipProps) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-xs text-foreground">
      <InitialsAvatar initials={initials} hue={hue} size={20} />
      {name}
    </span>
  );
}
