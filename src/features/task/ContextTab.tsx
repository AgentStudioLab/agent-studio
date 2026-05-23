import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { InitialsAvatar } from "@/shared/atoms/InitialsAvatar";
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
  const { context, isLoading } = useThreadContext(threadId);
  const { skills, mcpServers } = context;

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
              <div
                key={skill.id}
                className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-bg-200/60 transition"
              >
                <InitialsAvatar
                  initials={skill.name.slice(0, 1).toUpperCase()}
                  size={20}
                  className="shrink-0 text-[10px] font-bold"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-text-200 font-mono leading-tight">
                    {skill.name}
                  </div>
                  {skill.description && (
                    <div className="text-[11px] text-text-400 leading-tight mt-0.5">
                      {skill.description}
                    </div>
                  )}
                </div>
              </div>
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
