import {
  ChevronDown,
  FolderOpen as FolderIcon,
  Hand,
  MessageSquare,
  MoreHorizontal,
  Pin,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/app/AppShell";
import { useAppShell } from "@/app/AppShellContext";
import { CollapsibleCard } from "@/features/project-detail/CollapsibleCard";
import { InstructionsCard } from "@/features/project-detail/InstructionsCard";
import { ScheduledMiniCard } from "@/features/project-detail/ScheduledMiniCard";
import { ComputerContextCard } from "@/features/project-detail/ComputerContextCard";
import { MemoryCard } from "@/features/project-detail/MemoryCard";
import { projects } from "@/lib/mock/projects";
import {
  PromptInput,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";

export function ProjectDetailView() {
  const { activeProjectId } = useAppShell();
  const project =
    projects.find((p) => p.id === activeProjectId) ?? projects[0]!;
  const { t } = useTranslation();

  return (
    <AppShell
      main={
        <div className="flex h-full flex-col overflow-y-auto">
          <header className="flex items-center justify-between gap-4 px-12 pt-10 pb-6">
            <h1 className="font-serif text-[40px] font-normal leading-none text-foreground">
              {project.name}
            </h1>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t("projectDetail.pin")}
              >
                <Pin className="size-4" />
              </button>
              <button
                type="button"
                className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t("projectDetail.more")}
              >
                <MoreHorizontal className="size-4" />
              </button>
            </div>
          </header>

          <section className="flex w-full max-w-[860px] flex-col gap-8 px-12 pb-12">
            <PromptInput onSubmit={() => {}}>
              <PromptInputTextarea
                placeholder={t("projectDetail.promptPlaceholder")}
                rows={2}
              />
              <PromptInputFooter>
                <PromptInputTools>
                  <PromptInputButton>
                    <FolderIcon className="size-4" />
                    <span>{project.name} +1</span>
                    <ChevronDown className="size-3" />
                  </PromptInputButton>
                  <PromptInputButton>
                    <Hand className="size-4" />
                    <span>{t("projectDetail.ask")}</span>
                    <ChevronDown className="size-3" />
                  </PromptInputButton>
                </PromptInputTools>
                <PromptInputTools>
                  <PromptInputButton>
                    <span>{t("projectDetail.legacyModel")}</span>
                    <ChevronDown className="size-3" />
                  </PromptInputButton>
                  <PromptInputSubmit />
                </PromptInputTools>
              </PromptInputFooter>
            </PromptInput>

            <div>
              <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("projectDetail.recents")}
              </h2>
              <ul className="flex flex-col gap-1">
                {(project.recentConversations ?? []).map((conv) => (
                  <li key={conv.id}>
                    <button
                      type="button"
                      className="flex w-full items-start gap-3 rounded-md p-3 text-left hover:bg-muted"
                    >
                      <MessageSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-foreground">
                          {conv.title}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {conv.preview}
                        </div>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {conv.time}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      }
      aside={
        <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
          <InstructionsCard instructions={project.instructions} />
          <ScheduledMiniCard scheduledTaskIds={project.scheduledTasks} />
          <CollapsibleCard title={t("projectDetail.context")} defaultOpen>
            <div className="flex flex-col gap-4">
              <ComputerContextCard context={project.computerContext} embedded />
              <MemoryCard memory={project.memory} embedded />
            </div>
          </CollapsibleCard>
        </div>
      }
    />
  );
}
