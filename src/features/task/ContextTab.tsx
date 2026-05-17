import { cn } from "@/lib/utils";
import { InitialsAvatar } from "@/shared/atoms/InitialsAvatar";
import type { MockSkill, MockMcpServer } from "@/lib/mock/types";

interface ContextTabProps {
  skills: MockSkill[];
  mcpServers: MockMcpServer[];
}

interface SectionHeadingProps {
  label: string;
  count: string;
}

function SectionHeading({ label, count }: SectionHeadingProps) {
  return (
    <div className="text-[11px] tracking-wider uppercase text-text-400 pt-3 pb-2 px-2 flex items-center justify-between">
      <span>{label}</span>
      <span className="text-text-400/70 font-mono normal-case tracking-normal">
        {count}
      </span>
    </div>
  );
}

export function ContextTab({ skills, mcpServers }: ContextTabProps) {
  const onCount = mcpServers.filter((m) => m.connected).length;

  return (
    <div>
      <SectionHeading
        label="Skills"
        count={`${skills.length} loaded`}
      />
      <div className="flex flex-col gap-1">
        {skills.map((skill) => (
          <div
            key={skill.id}
            className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-bg-200/60 transition"
          >
            <InitialsAvatar
              initials={skill.initials.slice(0, 1)}
              size={20}
              hue={skill.hue}
              className="shrink-0 text-[10px] font-bold"
            />
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-text-200 font-mono leading-tight">
                {skill.name}
              </div>
              <div className="text-[11px] text-text-400 leading-tight mt-0.5">
                {skill.description}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="pt-2">
        <SectionHeading
          label="MCP servers"
          count={`${onCount} / ${mcpServers.length} on`}
        />
      </div>
      <div className="flex flex-col gap-1">
        {mcpServers.map((server) => (
          <div
            key={server.id}
            className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-bg-200/60 transition"
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{
                background: server.connected
                  ? "hsl(var(--success-100))"
                  : "hsl(var(--text-400))",
                opacity: server.connected ? 1 : 0.4,
              }}
              role="status"
              aria-label={server.connected ? "connected" : "disconnected"}
            />
            <div className="flex-1 min-w-0">
              <div
                className={cn(
                  "text-[13px] font-mono leading-tight",
                  server.connected ? "text-text-200" : "text-text-400"
                )}
              >
                {server.name}
              </div>
              <div className="text-[11px] text-text-400 leading-tight mt-0.5">
                {server.description}
              </div>
            </div>
            {!server.connected && (
              <span className="text-[10px] text-text-400 italic">off</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
