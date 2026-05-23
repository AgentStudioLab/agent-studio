import { useState } from "react";
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
import { scheduledTasks as initialTasks } from "@/lib/mock/scheduled";
import type { MockScheduledTask } from "@/lib/mock/types";

export function ScheduledListView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<MockScheduledTask[]>(initialTasks);
  const [modalOpen, setModalOpen] = useState(false);

  const openTask = (id: string) => {
    navigate(`/scheduled/${id}`);
  };

  const moreIdeas = [
    { id: "daily-brief", label: t("scheduled.moreIdeas.dailyBrief"), icon: Coffee },
    { id: "weekly-review", label: t("scheduled.moreIdeas.weeklyReview"), icon: CalendarDays },
  ];

  const handleSave = (data: NewScheduledFormData) => {
    const next: MockScheduledTask = {
      id: `sched-${Date.now()}`,
      name: data.name,
      description: data.description,
      prompt: data.prompt,
      frequency: data.frequency,
      timeOfDay: data.timeOfDay,
      active: true,
    };
    setTasks((prev) => [next, ...prev]);
  };

  return (
    <AppShell
      main={
        <div className="flex h-full flex-col overflow-y-auto">
          <header className="flex items-start justify-between gap-4 px-12 pt-12 pb-4">
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
                className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t("scheduled.toolbar.sort")}
              >
                <ArrowUpDown className="size-4" />
              </button>
              <button
                type="button"
                className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
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
          <section className="grid grid-cols-1 gap-4 px-12 pb-8 sm:grid-cols-2 xl:grid-cols-3">
            {tasks.map((task) => (
              <ScheduledCard
                key={task.id}
                task={task}
                onClick={() => openTask(task.id)}
              />
            ))}
          </section>
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
            onSave={handleSave}
          />
        </div>
      }
    />
  );
}
