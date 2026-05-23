import { useState, type ReactNode } from "react";
import { Activity, Folder, Layers } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { ProcessTab } from "@/features/task/ProcessTab";
import { FilesTab } from "@/features/task/FilesTab";
import { ContextTab } from "@/features/task/ContextTab";
import type { TouchedFile } from "@/lib/agui/runtime/derivations";
import type { ChatState } from "@/lib/agui/runtime/types";

type TabId = "process" | "files" | "context";

interface TaskRightPanelProps {
  /** ChatState from TaskView's useChat — drives Process/Files derivations. */
  state: ChatState | null;
  /** threadId for ContextTab (TanStack Query-backed, doesn't need state). */
  threadId: string | null;
  /** Conversation working directory — drives Files Tab cwd filter + header. */
  workingDir: string | null;
  /** Called when a Files Tab entry is clicked — opens PreviewPane. */
  onOpenFile?: (file: TouchedFile) => void;
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
          : "text-text-300 hover:text-text-100 flex-1",
      )}
    >
      {icon}
      {active && <span className="text-[12px] font-medium">{label}</span>}
    </button>
  );
}

export function TaskRightPanel({
  state,
  threadId,
  workingDir,
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
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {tab === "process" && <ProcessTab state={state} />}
        {tab === "files" && (
          <FilesTab
            state={state}
            workingDir={workingDir}
            onOpenFile={onOpenFile}
          />
        )}
        {tab === "context" && <ContextTab threadId={threadId} />}
      </div>
    </div>
  );
}
