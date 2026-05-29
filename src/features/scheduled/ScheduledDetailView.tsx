import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, ChevronLeft, Clock, Pencil, Play, Trash2 } from "lucide-react";
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
import type { Frequency, ScheduledRun, ScheduledTask } from "@/lib/data/types";
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

/** "09:00" → "9:00" (drop the leading zero on the hour). */
function shortTime(hhmm: string): string {
  const [h, m] = hhmm.split(":");
  return `${Number(h)}:${m ?? "00"}`;
}

/** Calendar-day delta (to − from), ignoring wall-clock time. */
function dayDelta(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((b - a) / 86_400_000);
}

function formatRunWhen(ms: number, locale: string, t: TFunction): string {
  const d = new Date(ms);
  const delta = dayDelta(new Date(), d);
  const time = d.toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  });
  const day =
    delta === 0
      ? t("scheduled.detail.relToday")
      : delta === -1
        ? t("scheduled.detail.relYesterday")
        : d.toLocaleDateString(locale, { month: "short", day: "numeric" });
  return t("scheduled.detail.runWhen", { day, time });
}

function formatNextRun(
  task: ScheduledTask,
  locale: string,
  t: TFunction,
): string {
  if (task.frequency === "manual" || task.nextRunAt == null) {
    return t("scheduled.detail.nextRunManual");
  }
  const d = new Date(task.nextRunAt);
  const delta = dayDelta(new Date(), d);
  const day =
    delta === 0
      ? t("scheduled.detail.relToday")
      : delta === 1
        ? t("scheduled.detail.relTomorrow")
        : d.toLocaleDateString(locale, { month: "short", day: "numeric" });
  const time = task.timeOfDay
    ? shortTime(task.timeOfDay)
    : d.toLocaleTimeString(locale, {
        hour: "numeric",
        minute: "2-digit",
        hour12: false,
      });
  return t("scheduled.detail.nextRunAt", { day, time });
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
  // "Always allowed" collapses to a single binary now: act-without-asking =
  // every tool auto-approved during a run; ask = pauses for approval.
  const alwaysAllowed = task.permissionMode === "act-without-asking";

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

          <header className="flex items-start justify-between gap-4 px-12 pt-7">
            <div className="min-w-0">
              <h1 className="font-serif text-[36px] font-normal leading-none text-foreground">
                {task.name}
              </h1>
              {task.description && (
                <p className="mt-3 text-sm text-muted-foreground">
                  {task.description}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
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
                className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
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
                <Play className="size-4" /> {t("scheduled.detail.runNow")}
              </button>
            </div>
          </header>

          <div className="flex flex-wrap items-center gap-3 px-12 pt-5 pb-7">
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
                value: formatNextRun(task, i18n.language, t),
              })}
            </span>
          </div>

          <div
            className="mx-12 border-t"
            style={{ borderColor: "hsl(var(--border-300) / 0.1)" }}
          />

          <div className="grid grid-cols-1 gap-x-16 gap-y-10 px-12 py-8 lg:grid-cols-2">
            <section>
              <h2 className="mb-2 text-sm text-muted-foreground">
                {t("scheduled.detail.history")}
              </h2>
              {runs.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("scheduled.detail.runHistoryEmpty")}
                </p>
              ) : (
                <ul className="flex flex-col">
                  {runs.map((run) => (
                    <li key={run.threadId}>
                      <button
                        type="button"
                        onClick={() => navigate(`/task/${run.threadId}`)}
                        className="flex w-full items-center justify-between gap-3 border-b py-3 text-left transition-colors hover:bg-state-hover"
                        style={{ borderColor: "hsl(var(--border-300) / 0.08)" }}
                      >
                        <span className="min-w-0 flex-1 truncate text-[15px] text-foreground">
                          {formatRunWhen(run.createdAt, i18n.language, t)}
                        </span>
                        {run.status !== "completed" && (
                          <span
                            className={cn(
                              "shrink-0 rounded-sm px-2 py-0.5 text-xs",
                              STATUS_STYLE[run.status],
                            )}
                          >
                            {t(`scheduled.runStatus.${run.status}`)}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="flex flex-col gap-10">
              <section>
                <h2 className="mb-2 text-sm text-muted-foreground">
                  {t("scheduled.detail.instructions")}
                </h2>
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
                  {task.prompt}
                </p>
              </section>

              <section>
                <h2 className="mb-2 text-sm text-muted-foreground">
                  {t("scheduled.detail.repeats")}
                </h2>
                <p className="text-[15px] text-foreground">
                  {describeFrequency(task, t, i18n.language)}
                </p>
              </section>

              <section>
                <h2 className="mb-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                  {t("scheduled.detail.alwaysAllowed")}
                  <CheckCircle2
                    className={cn(
                      "size-4",
                      alwaysAllowed
                        ? "text-[hsl(var(--brand-100))]"
                        : "text-muted-foreground/40",
                    )}
                  />
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t("scheduled.detail.alwaysAllowedHint")}
                </p>
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
  const time = task.timeOfDay ? shortTime(task.timeOfDay) : undefined;
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
