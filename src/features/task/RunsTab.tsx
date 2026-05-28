import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useScheduledRuns } from "@/lib/data/scheduled-queries";

interface RunsTabProps {
  /** Origin scheduled task of the current conversation. */
  scheduledTaskId: string;
  /** The conversation currently shown — its run is highlighted. */
  currentThreadId: string | null;
}

function formatWhen(ms: number, locale: string): string {
  return new Date(ms).toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Right-panel tab for scheduled-run conversations: lists every execution of the
 * task by time and lets the user jump between them. Each run is its own
 * conversation thread; selecting one navigates to it.
 */
export function RunsTab({ scheduledTaskId, currentThreadId }: RunsTabProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data: runs = [], isLoading } = useScheduledRuns(scheduledTaskId);

  if (isLoading) {
    return (
      <div className="px-2 py-8 text-center text-sm text-text-300">
        {t("task.runsTab.loading")}
      </div>
    );
  }
  if (runs.length === 0) {
    return (
      <div className="px-2 py-8 text-center text-sm text-text-300">
        {t("task.runsTab.empty")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 pt-2">
      {runs.map((run) => {
        const active = run.threadId === currentThreadId;
        return (
          <button
            key={run.threadId}
            type="button"
            onClick={() => navigate(`/task/${run.threadId}`)}
            className={cn(
              "rounded-md px-3 py-2 text-left text-[13px] transition-colors",
              active
                ? "bg-state-selected text-text-100"
                : "text-text-200 hover:bg-state-hover hover:text-text-100",
            )}
          >
            {formatWhen(run.createdAt, i18n.language)}
          </button>
        );
      })}
    </div>
  );
}
