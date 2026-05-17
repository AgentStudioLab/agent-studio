import { ArrowUpDown, CalendarDays, ChevronDown, Coffee, Plus, Search } from "lucide-react";
import { AppShell } from "@/layouts/AppShell";
import { useAppShell } from "@/lib/AppShellContext";
import { ScheduledCard } from "@/features/scheduled/ScheduledCard";
import { KeepAwakeBanner } from "@/features/scheduled/KeepAwakeBanner";
import { scheduledTasks } from "@/lib/mock/scheduled";

const MORE_IDEAS = [
  { id: "daily-brief", label: "Daily brief", icon: Coffee },
  { id: "weekly-review", label: "Weekly review", icon: CalendarDays },
];

export function ScheduledListView() {
  const { setView } = useAppShell();
  return (
    <AppShell
      main={
        <div className="flex h-full flex-col overflow-y-auto">
          <header className="flex items-start justify-between gap-4 px-8 pt-10 pb-4">
            <div>
              <h1 className="font-serif text-4xl font-semibold text-foreground">Scheduled tasks</h1>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                Run tasks on a schedule or whenever you need them. Type{" "}
                <code className="rounded-sm bg-muted px-1 font-mono text-xs">/schedule</code> in
                any existing task to set one up.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Sort"
              >
                <ArrowUpDown className="size-4" />
              </button>
              <button
                type="button"
                className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Search"
              >
                <Search className="size-4" />
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:bg-foreground/90"
              >
                <Plus className="size-4" /> New task <ChevronDown className="size-3" />
              </button>
            </div>
          </header>
          <div className="px-8 pb-4">
            <KeepAwakeBanner />
          </div>
          <section className="grid grid-cols-1 gap-4 px-8 pb-8 sm:grid-cols-2 xl:grid-cols-3">
            {scheduledTasks.map((task) => (
              <ScheduledCard
                key={task.id}
                task={task}
                onClick={() => setView("scheduled-detail")}
              />
            ))}
          </section>
          <section className="flex flex-col items-center gap-3 px-8 pb-12 pt-6 text-center">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              More ideas
            </h3>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {MORE_IDEAS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm hover:bg-muted"
                >
                  <Icon className="size-4 text-muted-foreground" />
                  {label}
                </button>
              ))}
            </div>
          </section>
        </div>
      }
    />
  );
}
