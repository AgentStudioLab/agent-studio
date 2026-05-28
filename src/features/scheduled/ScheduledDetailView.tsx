import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Clock, Info, Pencil, Play, Plus, Trash2, X } from "lucide-react";
import { AppShell } from "@/app/AppShell";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { NewScheduledModal } from "@/features/scheduled/NewScheduledModal";
import { cn } from "@/lib/utils";
import type { Frequency, ScheduledRun } from "@/lib/data/types";
import {
  useDeleteScheduledTaskMutation,
  useRunScheduledTaskMutation,
  useScheduledRuns,
  useScheduledTask,
  useUpdateScheduledTaskMutation,
} from "@/lib/data/scheduled-queries";

const STATUS_STYLE: Record<ScheduledRun["status"], string> = {
  completed: "bg-[hsl(var(--success-100)/0.15)] text-[hsl(var(--success-100))]",
  error: "bg-[hsl(var(--danger-100)/0.15)] text-[hsl(var(--danger-100))]",
  awaiting_approval:
    "bg-[hsl(var(--warning-100)/0.15)] text-[hsl(var(--warning-100))]",
  running: "bg-[hsl(var(--brand-100)/0.15)] text-[hsl(var(--brand-100))]",
  cancelled: "bg-muted text-muted-foreground",
  idle: "bg-muted text-muted-foreground",
};

function formatWhen(ms: number | null | undefined, locale: string): string {
  if (ms == null) return "—";
  return new Date(ms).toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ScheduledDetailView() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { scheduledId } = useParams<{ scheduledId: string }>();
  const id = scheduledId ?? null;

  const { data: task, isLoading } = useScheduledTask(id);
  const { data: runs = [] } = useScheduledRuns(id);
  const updateMutation = useUpdateScheduledTaskMutation();
  const deleteMutation = useDeleteScheduledTaskMutation();
  const runNowMutation = useRunScheduledTaskMutation();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newTool, setNewTool] = useState("");

  if (!task) {
    return (
      <AppShell
        main={
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {isLoading ? t("scheduled.detail.loading") : t("scheduled.detail.notFound")}
          </div>
        }
      />
    );
  }

  const enabled = task.enabled;

  const addTool = () => {
    const tool = newTool.trim();
    if (!tool || task.allowedTools.includes(tool)) {
      setNewTool("");
      return;
    }
    updateMutation.mutate({
      id: task.id,
      patch: { allowedTools: [...task.allowedTools, tool] },
    });
    setNewTool("");
  };

  const removeTool = (tool: string) => {
    updateMutation.mutate({
      id: task.id,
      patch: { allowedTools: task.allowedTools.filter((x) => x !== tool) },
    });
  };

  return (
    <AppShell
      main={
        <div className="flex h-full flex-col overflow-y-auto">
          <div data-tauri-drag-region className="px-12 pt-10">
            <button
              type="button"
              onClick={() => navigate("/scheduled")}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="size-4" />
              {t("scheduled.detail.back")}
            </button>
          </div>

          <header className="flex items-start justify-between gap-4 px-12 pt-8 pb-3">
            <h1 className="font-serif text-[36px] font-normal leading-none text-foreground">
              {task.name}
            </h1>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="rounded-md p-2 text-muted-foreground hover:bg-state-hover hover:text-foreground"
                aria-label={t("scheduled.detail.edit")}
              >
                <Pencil className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className="rounded-md p-2 text-destructive hover:bg-destructive/10"
                aria-label={t("scheduled.detail.delete")}
              >
                <Trash2 className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => runNowMutation.mutate(task.id)}
                disabled={runNowMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-50"
              >
                <Play className="size-4 fill-current" /> {t("scheduled.detail.runNow")}
              </button>
            </div>
          </header>

          <p className="px-12 pb-5 text-sm text-muted-foreground">
            {task.description}
          </p>

          <div className="flex flex-wrap items-center gap-3 px-12 pb-6">
            <Switch
              checked={enabled}
              onCheckedChange={(v) =>
                updateMutation.mutate({ id: task.id, patch: { enabled: v } })
              }
              aria-label={t("scheduled.detail.active")}
            />
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs",
                enabled
                  ? "bg-[hsl(var(--success-100)/0.15)] text-[hsl(var(--success-100))]"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <Clock className="size-3" />
              {enabled ? t("scheduled.detail.active") : t("scheduled.detail.inactive")}
            </span>
            <span className="text-sm text-muted-foreground">
              {t("scheduled.detail.nextRun", {
                value:
                  task.frequency === "manual"
                    ? t("scheduled.detail.nextRunManual")
                    : formatWhen(task.nextRunAt, i18n.language),
              })}
            </span>
            {task.lastRunAt != null && (
              <span className="text-sm text-muted-foreground">
                {t("scheduled.detail.lastRun", {
                  value: formatWhen(task.lastRunAt, i18n.language),
                })}
              </span>
            )}
          </div>

          <div
            className="px-12 pt-6"
            style={{ borderTop: "1px solid hsl(var(--border-300) / 0.1)" }}
          >
            <div className="flex max-w-2xl flex-col gap-10 py-6">
              <section>
                <h2 className="mb-2 text-sm font-medium text-foreground">
                  {t("scheduled.detail.instructions")}
                </h2>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {task.prompt}
                </p>
              </section>

              <section>
                <h2 className="mb-2 text-sm font-medium text-foreground">
                  {t("scheduled.detail.repeats")}
                </h2>
                <p className="text-sm font-medium text-foreground">
                  {describeFrequency(task, t, i18n.language)}
                </p>
              </section>

              <section>
                <h2 className="mb-2 text-sm font-medium text-foreground">
                  {t("scheduled.detail.runHistory")}
                </h2>
                {runs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("scheduled.detail.runHistoryEmpty")}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {runs.map((run) => (
                      <li key={run.threadId}>
                        <button
                          type="button"
                          onClick={() => navigate(`/task/${run.threadId}`)}
                          className="flex w-full items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-state-hover"
                        >
                          <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                            {run.title}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatWhen(run.createdAt, i18n.language)}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 rounded-sm px-2 py-0.5 text-xs",
                              STATUS_STYLE[run.status],
                            )}
                          >
                            {t(`scheduled.runStatus.${run.status}`)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h2 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-foreground">
                  {t("scheduled.detail.alwaysAllowed")}
                  <Info className="size-3 text-muted-foreground" />
                </h2>
                <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
                  {t("scheduled.detail.alwaysAllowedHint")}
                </p>
                {task.allowedTools.length > 0 && (
                  <ul className="mb-3 flex flex-col gap-2">
                    {task.allowedTools.map((tool) => (
                      <li
                        key={tool}
                        className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
                      >
                        <span className="min-w-0 flex-1 truncate font-mono text-xs">
                          {tool}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeTool(tool)}
                          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-state-hover hover:text-foreground"
                          aria-label={t("scheduled.detail.allowedRemove")}
                        >
                          <X className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex items-center gap-2">
                  <input
                    value={newTool}
                    onChange={(e) => setNewTool(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTool();
                      }
                    }}
                    placeholder={t("scheduled.detail.allowedAddPlaceholder")}
                    className="flex-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={addTool}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-state-hover hover:text-foreground"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
              </section>
            </div>
          </div>

          <NewScheduledModal
            open={editOpen}
            onOpenChange={setEditOpen}
            mode="edit"
            initial={{
              name: task.name,
              description: task.description,
              prompt: task.prompt,
              frequency: task.frequency,
              timeOfDay: task.timeOfDay ?? undefined,
              weekday: task.weekday,
              workingDir: task.workingDir,
              model: task.model,
              permissionMode: task.permissionMode,
            }}
            onSave={(data) =>
              updateMutation.mutate({
                id: task.id,
                patch: {
                  name: data.name,
                  description: data.description,
                  prompt: data.prompt,
                  frequency: data.frequency,
                  timeOfDay: data.timeOfDay ?? null,
                  weekday: data.weekday ?? null,
                  workingDir: data.workingDir ?? null,
                  model: data.model ?? null,
                  permissionMode: data.permissionMode,
                },
              })
            }
          />

          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("scheduled.detail.deleteConfirm.title")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("scheduled.detail.deleteConfirm.description")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  {t("scheduled.detail.deleteConfirm.cancel")}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    deleteMutation.mutate(task.id);
                    navigate("/scheduled");
                  }}
                >
                  {t("scheduled.detail.deleteConfirm.confirm")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      }
    />
  );
}

function describeFrequency(
  task: { frequency: Frequency; timeOfDay: string | null; weekday: number | null },
  t: TFunction,
  locale: string,
): string {
  const time = task.timeOfDay ?? undefined;
  switch (task.frequency) {
    case "manual":
      return t("scheduled.detail.repeatsManual");
    case "hourly":
      return t("scheduled.detail.repeatsHourly");
    case "daily":
      return time
        ? t("scheduled.detail.repeatsDaily", { time })
        : t("scheduled.detail.repeatsDailyNoTime");
    case "weekdays":
      return time
        ? t("scheduled.detail.repeatsWeekdays", { time })
        : t("scheduled.detail.repeatsWeekdaysNoTime");
    case "weekly": {
      if (task.weekday == null) {
        return time
          ? t("scheduled.detail.repeatsWeekly", { time })
          : t("scheduled.detail.repeatsWeeklyNoTime");
      }
      // 2024-01-07 is a Sunday → weekday 0..6 maps to Sun..Sat.
      const day = new Intl.DateTimeFormat(locale, { weekday: "long" }).format(
        new Date(2024, 0, 7 + task.weekday),
      );
      return time
        ? t("scheduled.detail.repeatsWeeklyOn", { day, time })
        : t("scheduled.detail.repeatsWeeklyOnNoTime", { day });
    }
  }
}
