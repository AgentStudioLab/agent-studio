import { cn } from "@/lib/utils";
import { InitialsAvatar } from "@/features/_atoms/InitialsAvatar";
import type { MockSkill, MockMcpServer } from "@/lib/mock/types";

interface ContextTabProps {
  skills: MockSkill[];
  mcpServers: MockMcpServer[];
}

function SectionHeading({ children }: { children: string }) {
  return (
    <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}

export function ContextTab({ skills, mcpServers }: ContextTabProps) {
  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 py-3">
      <section className="mb-6">
        <SectionHeading>Skills</SectionHeading>
        <ul className="flex flex-col gap-3">
          {skills.map((skill) => (
            <li key={skill.id} className="flex items-start gap-3">
              <InitialsAvatar initials={skill.initials} size={32} hue={skill.hue} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">{skill.name}</div>
                <div className="text-xs text-muted-foreground">{skill.description}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <SectionHeading>MCP servers</SectionHeading>
        <ul className="flex flex-col gap-3">
          {mcpServers.map((server) => (
            <li key={server.id} className="flex items-start gap-3">
              <span
                className={cn(
                  "mt-1.5 inline-block size-2 rounded-full",
                  server.connected ? "bg-[hsl(var(--success-100))]" : "bg-[hsl(var(--text-400))]"
                )}
                role="status"
                aria-label={server.connected ? "connected" : "disconnected"}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">{server.name}</div>
                <div className="text-xs text-muted-foreground">{server.description}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
