import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Clock, Info, Pencil, Play, Trash2 } from "lucide-react";
import { AppShell } from "@/app/AppShell";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { scheduledTasks } from "@/lib/mock/scheduled";
import type { MockScheduledTask } from "@/lib/mock/types";

export function ScheduledDetailView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { scheduledId } = useParams<{ scheduledId: string }>();
  const task =
    scheduledTasks.find((s) => s.id === scheduledId) ?? scheduledTasks[0]!;
  const [active, setActive] = useState(task.active);

  return (
    <AppShell
      main={
        <div className="flex h-full flex-col overflow-y-auto">
          <div className="px-12 pt-10">
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
                className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t("scheduled.detail.edit")}
              >
                <Pencil className="size-4" />
              </button>
              <button
                type="button"
                className="rounded-md p-2 text-destructive hover:bg-destructive/10"
                aria-label={t("scheduled.detail.delete")}
              >
                <Trash2 className="size-4" />
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:bg-foreground/90"
              >
                <Play className="size-4 fill-current" /> {t("scheduled.detail.runNow")}
              </button>
            </div>
          </header>

          <p className="px-12 pb-5 text-sm text-muted-foreground">
            {task.description}
          </p>

          <div className="flex items-center gap-3 px-12 pb-6">
            <Switch
              checked={active}
              onCheckedChange={setActive}
              aria-label={t("scheduled.detail.active")}
            />
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs",
                active
                  ? "bg-[hsl(var(--success-100)/0.15)] text-[hsl(var(--success-100))]"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <Clock className="size-3" />
              {active ? t("scheduled.detail.active") : t("scheduled.detail.inactive")}
            </span>
            <span className="text-sm text-muted-foreground">
              {t("scheduled.detail.nextRun", { value: task.nextRun ?? "—" })}
            </span>
          </div>

          <div
            className="px-12 pt-6"
            style={{ borderTop: "1px solid hsl(var(--border-300) / 0.1)" }}
          >
            <div className="grid max-w-[1100px] grid-cols-2 gap-12 py-6">
              <div />
              <div className="flex flex-col gap-10">
                <section>
                  <h2 className="mb-2 text-sm font-medium text-foreground">
                    {t("scheduled.detail.instructions")}
                  </h2>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {task.prompt}
                  </p>
                </section>

                <section>
                  <h2 className="mb-2 text-sm font-medium text-foreground">
                    {t("scheduled.detail.repeats")}
                  </h2>
                  <p className="text-sm font-medium text-foreground">
                    {describeFrequency(task, t)}
                  </p>
                </section>

                <section>
                  <h2 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-foreground">
                    {t("scheduled.detail.alwaysAllowed")}
                    <Info className="size-3 text-muted-foreground" />
                  </h2>
                  <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
                    {t("scheduled.detail.alwaysAllowedHint")}
                  </p>
                  {task.alwaysAllowed && task.alwaysAllowed.length > 0 && (
                    <ul className="flex flex-col gap-2">
                      {task.alwaysAllowed.map((approval, i) => (
                        <li
                          key={i}
                          className="rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
                        >
                          {approval}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </div>
          </div>
        </div>
      }
    />
  );
}

function describeFrequency(task: MockScheduledTask, t: TFunction): string {
  const time = task.timeOfDay;
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
    case "weekly":
      return time
        ? t("scheduled.detail.repeatsWeekly", { time })
        : t("scheduled.detail.repeatsWeeklyNoTime");
  }
}
