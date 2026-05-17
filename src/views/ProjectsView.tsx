import { ArrowUpDown, Search, Plus } from "lucide-react";
import { AppShell } from "@/layouts/AppShell";
import { useAppShell } from "@/lib/AppShellContext";
import { ProjectCard } from "@/features/project/ProjectCard";
import { projects } from "@/lib/mock/projects";

export function ProjectsView() {
  const { setView } = useAppShell();

  return (
    <AppShell
      main={
        <div className="flex h-full flex-col overflow-y-auto">
          <header className="flex items-center justify-between gap-4 px-8 pt-10 pb-6">
            <h1 className="font-serif text-4xl font-semibold text-foreground">Projects</h1>
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
                <Plus className="size-4" /> New project
              </button>
            </div>
          </header>
          <section className="grid grid-cols-1 gap-4 px-8 pb-10 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onClick={() => setView("project-detail")}
              />
            ))}
          </section>
        </div>
      }
    />
  );
}
