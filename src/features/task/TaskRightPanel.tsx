import { useState, type ReactNode } from "react";
import { Activity, Folder, Layers, Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { ProcessTab } from "@/features/task/ProcessTab";
import { FilesTab } from "@/features/task/FilesTab";
import { ContextTab } from "@/features/task/ContextTab";
import { useThreadAllowedTools } from "@/lib/data/thread-tools-queries";
import type { MockTask, MockFile, MockSkill, MockMcpServer } from "@/lib/mock/types";

type TabId = "process" | "files" | "context" | "config";

interface TaskRightPanelProps {
  threadId?: string | null;
  task?: MockTask | null;
  files?: MockFile[];
  skills?: MockSkill[];
  mcpServers?: MockMcpServer[];
  onOpenFile?: (file: MockFile) => void;
}

interface TabButtonProps {
  id: TabId;
  label: string;
  icon: ReactNode;
  active: boolean;
  onClick: (id: TabId) => void;
}

function TabButton({ id, label, icon, active, onClick }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      title={label}
      className={cn(
        "flex items-center justify-center gap-1.5 px-2 py-1.5 rounded transition",
        active
          ? "bg-bg-000 text-text-100 shadow-sm flex-[1.6]"
          : "text-text-300 hover:text-text-100 flex-1"
      )}
    >
      {icon}
      {active && <span className="text-[12px] font-medium">{label}</span>}
    </button>
  );
}

const ALL_TOOLS = ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "WebFetch", "WebSearch", "Task"] as const;

function ConfigTab({ threadId }: { threadId: string | null | undefined }) {
  const { t } = useTranslation();
  const { tools, overrideMode, setTools } = useThreadAllowedTools(threadId ?? null);

  const toggleOverrideMode = () => {
    if (overrideMode === "global") {
      setTools(tools); // seed override with currently-resolved tools
    } else {
      setTools(null); // clear override, revert to global
    }
  };

  const toggleTool = (tool: string) => {
    if (overrideMode === "global") return;
    const next = tools.includes(tool)
      ? tools.filter((t) => t !== tool)
      : [...tools, tool];
    setTools(next);
  };

  return (
    <div className="px-2 py-3">
      <section className="space-y-2">
        <h4 className="text-[11px] tracking-wider uppercase text-text-400 px-2 pb-1">
          {t("task.toolsPanel.title")}
        </h4>
        <div className="px-2 text-xs" style={{ color: "hsl(var(--text-300))" }}>
          {overrideMode === "global"
            ? t("task.toolsPanel.followGlobal")
            : t("task.toolsPanel.customize")}
        </div>
        <div className="flex flex-col gap-1 px-2">
          {ALL_TOOLS.map((tool) => (
            <label
              key={tool}
              className={cn(
                "flex items-center gap-2 text-sm",
                overrideMode === "global" ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
              )}
            >
              <input
                type="checkbox"
                checked={tools.includes(tool)}
                disabled={overrideMode === "global"}
                onChange={() => toggleTool(tool)}
                className="h-4 w-4 rounded border border-[var(--border-200)] accent-[var(--brand-100)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-100)]"
              />
              <span className="text-[13px] text-text-200">
                {t(`settings.defaultTools.toolName.${tool}` as never)}
              </span>
            </label>
          ))}
        </div>
        <div className="px-2 pt-1">
          <button
            type="button"
            onClick={toggleOverrideMode}
            className="text-xs underline hover:opacity-80"
            style={{ color: "hsl(var(--brand-100))" }}
          >
            {overrideMode === "global"
              ? t("task.toolsPanel.customize")
              : t("task.toolsPanel.restore")}
          </button>
        </div>
      </section>
    </div>
  );
}

// AppShell already wraps `aside` slot in a 320px-wide column with the
// border-left + bg. We render the tab bar + tab body inside that.
export function TaskRightPanel({
  threadId,
  task,
  files = [],
  skills = [],
  mcpServers = [],
  onOpenFile,
}: TaskRightPanelProps) {
  const [tab, setTab] = useState<TabId>("process");
  const { t } = useTranslation();

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pt-3 pb-2">
        <div
          className="flex items-center gap-0.5 p-0.5 rounded-md"
          style={{
            background: "hsl(var(--bg-200))",
            border: "1px solid hsl(var(--border-300) / 0.12)",
          }}
        >
          <TabButton
            id="process"
            label={t("task.tabs.process")}
            icon={<Activity size={14} />}
            active={tab === "process"}
            onClick={setTab}
          />
          <TabButton
            id="files"
            label={t("task.tabs.files")}
            icon={<Folder size={14} />}
            active={tab === "files"}
            onClick={setTab}
          />
          <TabButton
            id="context"
            label={t("task.tabs.context")}
            icon={<Layers size={14} />}
            active={tab === "context"}
            onClick={setTab}
          />
          <TabButton
            id="config"
            label={t("task.toolsPanel.title")}
            icon={<Wrench size={14} />}
            active={tab === "config"}
            onClick={setTab}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {tab === "process" && <ProcessTab task={task} />}
        {tab === "files" && <FilesTab files={files} onOpenFile={onOpenFile} />}
        {tab === "context" && (
          <ContextTab skills={skills} mcpServers={mcpServers} />
        )}
        {tab === "config" && <ConfigTab threadId={threadId} />}
      </div>
    </div>
  );
}
