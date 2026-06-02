import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Clock, ExternalLink, ScrollText } from "lucide-react";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import { cn } from "@/lib/utils";
import { useThreadContext, type ContextMcpServer } from "@/lib/agui/react/useThreadContext";
import { useAgentLinks } from "@/lib/data/agent-link-queries";
import { useAgentFolders } from "@/lib/data/agent-folder-queries";
import { useAgentMemoryTree } from "@/lib/data/agent-memory-tree-queries";
import type { MemoryTreeNode } from "@/lib/data/agent-memory-tree";
import { AgentFoldersCard, type OpenFolderFile } from "@/shared/agent-context/AgentFoldersCard";
import { MemoryFilesCard } from "@/shared/agent-context/MemoryFilesCard";

interface ContextTabProps {
  threadId: string | null;
  /** Bound agent → surface its folders / links / memory + the agent_studio MCP. */
  agentWorkspaceId?: string | null;
  /** When set, the conversation is a scheduled run — show a link back to the task. */
  scheduledTaskId?: string | null;
  scheduledTaskName?: string | null;
  /** Open a folder/memory file in the preview pane (with its sandbox cwd). */
  onOpenFile?: OpenFolderFile;
}

/** in-process MCP server always mounted on agent-bound runs (remember +
 *  scheduled-task tools). The SDK doesn't report SDK-type servers in
 *  system.init, so we surface it ourselves. */
const AGENT_STUDIO_MCP = "agent_studio";

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

/** icon-chip + label row, matching the skills/scheduled entries. */
function ChipRow({
  icon,
  label,
  meta,
  onClick,
  title,
  trailing,
}: {
  icon: React.ReactNode;
  label: string;
  meta?: string;
  onClick?: () => void;
  title?: string;
  trailing?: React.ReactNode;
}) {
  const inner = (
    <>
      <span
        aria-hidden="true"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-bg-200"
      >
        {icon}
      </span>
      <span className="flex-1 min-w-0 truncate text-[13px] text-text-200 leading-tight">
        {label}
      </span>
      {meta && <span className="shrink-0 truncate text-[11px] text-text-400">{meta}</span>}
      {trailing}
    </>
  );
  const cls =
    "flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-bg-200/60 transition";
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(cls, "w-full text-left")} title={title}>
      {inner}
    </button>
  ) : (
    <div className={cls} title={title}>
      {inner}
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function collectMemoryFiles(nodes: MemoryTreeNode[]): string[] {
  const out: string[] = [];
  const walk = (ns: MemoryTreeNode[]) => {
    for (const n of ns) {
      if (n.kind === "file") {
        if (n.name !== "MEMORY.md") out.push(n.name.replace(/\.md$/, ""));
      } else walk(n.children ?? []);
    }
  };
  walk(nodes);
  return out;
}

export function ContextTab({
  threadId,
  agentWorkspaceId,
  scheduledTaskId,
  scheduledTaskName,
  onOpenFile,
}: ContextTabProps) {
  const { t } = useTranslation();
  const { context, isLoading } = useThreadContext(threadId);
  const { skills } = context;

  const isAgentBound = Boolean(agentWorkspaceId);
  const { data: folders } = useAgentFolders(agentWorkspaceId ?? null);
  const { data: links } = useAgentLinks(agentWorkspaceId ?? null);
  const { data: memoryTree } = useAgentMemoryTree(agentWorkspaceId ?? null, isAgentBound);
  const folderList = folders ?? [];
  const linkList = links ?? [];
  const memoryFiles = collectMemoryFiles(memoryTree ?? []);

  // agent_studio MCP is always loaded on agent-bound runs — surface it alongside
  // any SDK-reported servers (the SDK omits SDK-type servers from system.init).
  const mcpServers: ContextMcpServer[] = isAgentBound
    ? [
        ...context.mcpServers.filter((m) => m.name !== AGENT_STUDIO_MCP),
        {
          name: AGENT_STUDIO_MCP,
          description: t("task.contextTab.agentMcpDescription"),
          connected: true,
        },
      ]
    : context.mcpServers;

  const buildSkillLink = (skillId: string) =>
    `/skills?skill=${encodeURIComponent(skillId)}`;

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

  if (skills.length === 0 && mcpServers.length === 0 && !scheduledTaskId) {
    return (
      <div className="px-6 py-12 text-center text-sm" style={{ color: "hsl(var(--text-300))" }}>
        <div>{t("task.contextTab.empty.noCapabilities")}</div>
        <Link
          to="/skills"
          className="mt-3 inline-block text-[12px] underline underline-offset-4"
          style={{ color: "hsl(var(--brand-100))" }}
        >
          {t("task.contextTab.empty.goToSkills")}
        </Link>
      </div>
    );
  }

  const onCount = mcpServers.filter((m) => m.connected).length;
  const iconStyle = { color: "hsl(var(--text-400))" } as const;

  return (
    <div>
      {scheduledTaskId && (
        <>
          <SectionHeading label={t("task.contextTab.scheduled")} count="" />
          <Link
            to={`/scheduled/${scheduledTaskId}`}
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-bg-200/60 transition"
            title={t("task.contextTab.scheduledOpen")}
          >
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-bg-200"
            >
              <Clock className="size-3.5" style={iconStyle} />
            </span>
            <span className="flex-1 min-w-0 truncate text-[13px] text-text-200 leading-tight">
              {scheduledTaskName ?? t("task.contextTab.scheduledTask")}
            </span>
            <ExternalLink className="size-3.5 shrink-0 text-text-400" />
          </Link>
        </>
      )}

      {skills.length > 0 && (
        <>
          <SectionHeading
            label={t("task.contextTab.skills")}
            count={t("task.contextTab.skillsLoaded", { count: skills.length })}
          />
          <div className="flex flex-col gap-1">
            {skills.map((skill) => (
              <Link key={skill.id} to={buildSkillLink(skill.id)} title={skill.description || skill.name}>
                <ChipRow icon={<ScrollText className="size-3.5" style={iconStyle} />} label={skill.name} />
              </Link>
            ))}
          </div>
        </>
      )}

      {mcpServers.length > 0 && (
        <div className={skills.length > 0 ? "pt-2" : ""}>
          <SectionHeading
            label={t("task.contextTab.mcpServers")}
            count={t("task.contextTab.mcpOnCount", { on: onCount, total: mcpServers.length })}
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
                    background: server.connected ? "hsl(var(--success-100))" : "hsl(var(--text-400))",
                    opacity: server.connected ? 1 : 0.4,
                  }}
                  role="status"
                  aria-label={server.connected ? t("task.contextTab.connected") : t("task.contextTab.disconnected")}
                />
                <div className="flex-1 min-w-0">
                  <div className={cn("text-[13px] font-mono leading-tight", server.connected ? "text-text-200" : "text-text-400")}>
                    {server.name}
                  </div>
                  {server.description && (
                    <div className="text-[11px] text-text-400 leading-tight mt-0.5">{server.description}</div>
                  )}
                </div>
                {!server.connected && (
                  <span className="text-[10px] text-text-400 italic">{t("task.contextTab.off")}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {agentWorkspaceId && folderList.length > 0 && (
        <>
          <SectionHeading label={t("task.contextTab.folders")} count={String(folderList.length)} />
          <AgentFoldersCard agentId={agentWorkspaceId} onOpenFile={onOpenFile} />
        </>
      )}

      {linkList.length > 0 && (
        <>
          <SectionHeading label={t("task.contextTab.links")} count={String(linkList.length)} />
          <div className="flex flex-col gap-1">
            {linkList.map((l) => (
              <ChipRow
                key={l.id}
                icon={<ExternalLink className="size-3.5" style={iconStyle} />}
                label={l.title}
                meta={hostOf(l.url)}
                title={l.url}
                onClick={() => void shellOpen(l.url).catch(() => {})}
              />
            ))}
          </div>
        </>
      )}

      {agentWorkspaceId && memoryFiles.length > 0 && (
        <>
          <SectionHeading label={t("task.contextTab.memory")} count={String(memoryFiles.length)} />
          <MemoryFilesCard agentId={agentWorkspaceId} onOpenFile={onOpenFile} />
        </>
      )}
    </div>
  );
}
