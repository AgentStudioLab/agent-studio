import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useThreadContext } from "@/lib/agui/react/useThreadContext";

interface ContextTabProps {
  threadId: string | null;
}

function SectionHeading({ label, count }: { label: string; count: string }) {
  return (
    <div className="text-[11px] tracking-wider uppercase text-text-400 pt-3 pb-2 px-2 flex items-center justify-between">
      <span>{label}</span>
      <span className="text-text-400/70 font-mono normal-case tracking-normal">
        {count}
      </span>
    </div>
  );
}

export function ContextTab({ threadId }: ContextTabProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const { context, isLoading } = useThreadContext(threadId);
  const { skills, mcpServers } = context;

  // Build a /customize deep-link that remembers where we came from. The
  // `from` param is read back by CustomizeView's back button so the user
  // returns to *this* thread instead of the New Task screen.
  const buildSkillLink = (skillId: string) => {
    const back = encodeURIComponent(location.pathname + location.search);
    return `/customize?section=skills&skill=${encodeURIComponent(skillId)}&from=${back}`;
  };

  // No active thread OR query in-flight → "waiting for agent" state. We can't
  // gate on isLoading alone — TanStack Query v5 reports isLoading=false when
  // the query is disabled (threadId null), so the null path would otherwise
  // fall through to "noCapabilities" instead of the correct "notStarted".
  if (!threadId || isLoading) {
    return (
      <div className="px-6 py-12 text-center text-sm" style={{ color: "hsl(var(--text-300))" }}>
        {t("task.contextTab.empty.notStarted")}
      </div>
    );
  }

  if (skills.length === 0 && mcpServers.length === 0) {
    return (
      <div className="px-6 py-12 text-center text-sm" style={{ color: "hsl(var(--text-300))" }}>
        <div>{t("task.contextTab.empty.noCapabilities")}</div>
        <Link
          to="/customize"
          className="mt-3 inline-block text-[12px] underline underline-offset-4"
          style={{ color: "hsl(var(--brand-100))" }}
        >
          {t("task.contextTab.empty.goToCustomize")}
        </Link>
      </div>
    );
  }

  const onCount = mcpServers.filter((m) => m.connected).length;

  return (
    <div>
      {skills.length > 0 && (
        <>
          <SectionHeading
            label={t("task.contextTab.skills")}
            count={t("task.contextTab.skillsLoaded", { count: skills.length })}
          />
          <div className="flex flex-col gap-1">
            {skills.map((skill) => (
              <Link
                key={skill.id}
                to={buildSkillLink(skill.id)}
                className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-bg-200/60 transition"
                title={skill.description || skill.name}
              >
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-bg-200"
                >
                  <ScrollText
                    className="size-3.5"
                    style={{ color: "hsl(var(--text-400))" }}
                  />
                </span>
                <span className="flex-1 min-w-0 truncate text-[13px] font-mono text-text-200 leading-tight">
                  {skill.name}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      {mcpServers.length > 0 && (
        <div className={skills.length > 0 ? "pt-2" : ""}>
          <SectionHeading
            label={t("task.contextTab.mcpServers")}
            count={t("task.contextTab.mcpOnCount", {
              on: onCount,
              total: mcpServers.length,
            })}
          />
          <div className="flex flex-col gap-1">
            {mcpServers.map((server) => (
              <div
                key={server.name}
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
                  aria-label={
                    server.connected
                      ? t("task.contextTab.connected")
                      : t("task.contextTab.disconnected")
                  }
                />
                <div className="flex-1 min-w-0">
                  <div
                    className={cn(
                      "text-[13px] font-mono leading-tight",
                      server.connected ? "text-text-200" : "text-text-400",
                    )}
                  >
                    {server.name}
                  </div>
                  {server.description && (
                    <div className="text-[11px] text-text-400 leading-tight mt-0.5">
                      {server.description}
                    </div>
                  )}
                </div>
                {!server.connected && (
                  <span className="text-[10px] text-text-400 italic">
                    {t("task.contextTab.off")}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
