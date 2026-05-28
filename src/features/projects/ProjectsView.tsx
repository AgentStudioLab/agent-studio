import { useState } from "react";
import { ArrowUpDown, Search, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/app/AppShell";
import { ProjectCard } from "@/features/projects/ProjectCard";
import {
  NewProjectModal,
  type NewProjectFormData,
} from "@/features/projects/NewProjectModal";
import { projects as initialProjects } from "@/lib/mock/projects";
import type { MockProject } from "@/lib/mock/types";

export function ProjectsView() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [projects, setProjects] = useState<MockProject[]>(initialProjects);
  const [modalOpen, setModalOpen] = useState(false);

  const handleSave = (data: NewProjectFormData) => {
    const next: MockProject = {
      id: `proj-${Date.now()}`,
      name: data.name,
      lastActivity: "just now",
      instructions: data.instructions,
      memory: [],
      recentConversations: [],
    };
    setProjects((prev) => [next, ...prev]);
  };

  const openProject = (id: string) => {
    navigate(`/projects/${id}`);
  };

  return (
    <AppShell
      main={
        <div className="flex h-full flex-col overflow-y-auto">
          <header
            data-tauri-drag-region
            className="flex items-center justify-between gap-4 px-12 pt-12 pb-8"
          >
            <h1 className="font-serif text-[34px] font-normal leading-none text-foreground">
              {t("projects.title")}
            </h1>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t("projects.sort")}
              >
                <ArrowUpDown className="size-4" />
              </button>
              <button
                type="button"
                className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t("projects.search")}
              >
                <Search className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:bg-foreground/90"
              >
                <Plus className="size-4" /> {t("projects.newProject")}
              </button>
            </div>
          </header>
          <section className="grid grid-cols-1 gap-4 px-12 pb-12 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onClick={() => openProject(p.id)}
              />
            ))}
          </section>
          <NewProjectModal
            open={modalOpen}
            onOpenChange={setModalOpen}
            onSave={handleSave}
          />
        </div>
      }
    />
  );
}
