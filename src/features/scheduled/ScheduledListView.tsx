import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ArrowUpDown, CalendarDays, ChevronDown, Coffee, Plus, Search } from "lucide-react";
import { AppShell } from "@/app/AppShell";
import { ScheduledCard } from "@/features/scheduled/ScheduledCard";
import { KeepAwakeBanner } from "@/features/scheduled/KeepAwakeBanner";
import {
  NewScheduledModal,
  type NewScheduledFormData,
} from "@/features/scheduled/NewScheduledModal";
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
import {
  useCreateScheduledTaskMutation,
  useDeleteScheduledTaskMutation,
  useRunScheduledTaskMutation,
  useScheduledTasks,
  useUpdateScheduledTaskMutation,
} from "@/lib/data/scheduled-queries";
import type { ScheduledTask } from "@/lib/data/types";
import { useThreadStatuses } from "@/lib/agui/react/useThreadStatuses";

export function ScheduledListView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);
  const [editTask, setEditTask] = useState<ScheduledTask | null>(null);
  const [deleteTask, setDeleteTask] = useState<ScheduledTask | null>(null);
  const { data: tasks = [], isLoading } = useScheduledTasks();
  const { data: statuses = [] } = useThreadStatuses();
  const createMutation = useCreateScheduledTaskMutation();
  const updateMutation = useUpdateScheduledTaskMutation();
  const deleteMutation = useDeleteScheduledTaskMutation();
  const runNowMutation = useRunScheduledTaskMutation();

  // Scheduled tasks with a spawned run currently paused on HITL approval.
  const awaitingTaskIds = useMemo(() => {
    const set = new Set<string>();
    for (const s of statuses) {
      if (s.status === "awaiting_approval" && s.scheduledTaskId) {
        set.add(s.scheduledTaskId);
      }
    }
    return set;
  }, [statuses]);

  const openTask = (id: string) => navigate(`/scheduled/${id}`);

  const moreIdeas = [
    { id: "daily-brief", label: t("scheduled.moreIdeas.dailyBrief"), icon: Coffee },
    { id: "weekly-review", label: t("scheduled.moreIdeas.weeklyReview"), icon: CalendarDays },
  ];

  const handleCreate = (data: NewScheduledFormData) => {
    createMutation.mutate({
      name: data.name,
      description: data.description,
      prompt: data.prompt,
      frequency: data.frequency,
      timeOfDay: data.timeOfDay ?? null,
      weekday: data.weekday ?? null,
      workingDir: data.workingDir ?? null,
      model: data.model ?? null,
      permissionMode: data.permissionMode,
    });
  };

  const handleEditSave = (data: NewScheduledFormData) => {
    if (!editTask) return;
    updateMutation.mutate({
      id: editTask.id,
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
    });
  };

  return (
    <AppShell
      main={
        <div className="flex h-full flex-col overflow-y-auto">
          <header
            data-tauri-drag-region
            className="flex items-start justify-between gap-4 px-12 pt-12 pb-4"
          >
            <div>
              <h1 className="font-serif text-[32px] font-normal leading-none text-foreground">
                {t("scheduled.title")}
              </h1>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                {t("scheduled.subtitle")}{" "}
                <code className="rounded-sm bg-muted px-1 font-mono text-xs">/schedule</code>{" "}
                {t("scheduled.subtitleSuffix")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-md p-2 text-muted-foreground hover:bg-state-hover hover:text-foreground"
                aria-label={t("scheduled.toolbar.sort")}
              >
                <ArrowUpDown className="size-4" />
              </button>
              <button
                type="button"
                className="rounded-md p-2 text-muted-foreground hover:bg-state-hover hover:text-foreground"
                aria-label={t("scheduled.toolbar.search")}
              >
                <Search className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:bg-foreground/90"
              >
                <Plus className="size-4" /> {t("scheduled.toolbar.newTask")} <ChevronDown className="size-3" />
              </button>
            </div>
          </header>
          <div className="px-12 pb-4 pt-6">
            <KeepAwakeBanner />
          </div>
          {!isLoading && tasks.length === 0 ? (
            <p className="px-12 py-12 text-center text-sm text-muted-foreground">
              {t("scheduled.empty")}
            </p>
          ) : (
            <section className="grid grid-cols-1 gap-4 px-12 pb-8 sm:grid-cols-2 xl:grid-cols-3">
              {tasks.map((task) => (
                <ScheduledCard
                  key={task.id}
                  task={task}
                  enabled={task.enabled}
                  needsAttention={awaitingTaskIds.has(task.id)}
                  needsAttentionLabel={t("scheduled.badge.awaiting")}
                  onClick={() => openTask(task.id)}
                  onRunNow={() => runNowMutation.mutate(task.id)}
                  onToggleEnabled={(next) =>
                    updateMutation.mutate({ id: task.id, patch: { enabled: next } })
                  }
                  onEdit={() => setEditTask(task)}
                  onDelete={() => setDeleteTask(task)}
                />
              ))}
            </section>
          )}
          <section className="flex flex-col items-center gap-3 px-12 pb-12 pt-6 text-center">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("scheduled.moreIdeas.label")}
            </h3>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {moreIdeas.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm hover:bg-muted"
                >
                  <Icon className="size-4 text-muted-foreground" />
                  {label}
                </button>
              ))}
            </div>
          </section>

          <NewScheduledModal
            open={modalOpen}
            onOpenChange={setModalOpen}
            onSave={handleCreate}
          />
          <NewScheduledModal
            open={!!editTask}
            onOpenChange={(o) => {
              if (!o) setEditTask(null);
            }}
            mode="edit"
            initial={
              editTask
                ? {
                    name: editTask.name,
                    description: editTask.description,
                    prompt: editTask.prompt,
                    frequency: editTask.frequency,
                    timeOfDay: editTask.timeOfDay ?? undefined,
                    weekday: editTask.weekday,
                    workingDir: editTask.workingDir,
                    model: editTask.model,
                    permissionMode: editTask.permissionMode,
                  }
                : undefined
            }
            onSave={handleEditSave}
          />

          <AlertDialog
            open={!!deleteTask}
            onOpenChange={(o) => {
              if (!o) setDeleteTask(null);
            }}
          >
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
                    if (deleteTask) deleteMutation.mutate(deleteTask.id);
                    setDeleteTask(null);
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
