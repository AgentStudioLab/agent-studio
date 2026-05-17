import {
  ChevronDown,
  FolderOpen as FolderIcon,
  Hand,
  MessageSquare,
  MoreHorizontal,
  Pin,
} from "lucide-react";
import { AppShell } from "@/layouts/AppShell";
import { CollapsibleCard } from "@/features/project/CollapsibleCard";
import { InstructionsCard } from "@/features/project/InstructionsCard";
import { ScheduledMiniCard } from "@/features/project/ScheduledMiniCard";
import { ComputerContextCard } from "@/features/project/ComputerContextCard";
import { MemoryCard } from "@/features/project/MemoryCard";
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
  const project = projects.find((p) => p.id === "proj-jay") ?? projects[0]!;

  return (
    <AppShell
      main={
        <div className="flex h-full flex-col overflow-y-auto">
          <header className="flex items-center justify-between gap-4 px-8 pt-10 pb-6">
            <h1 className="font-serif text-4xl font-semibold text-foreground">
              {project.name}
            </h1>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Pin"
              >
                <Pin className="size-4" />
              </button>
              <button
                type="button"
                className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="More"
              >
                <MoreHorizontal className="size-4" />
              </button>
            </div>
          </header>

          <section className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-8 pb-10">
            <PromptInput onSubmit={() => {}}>
              <PromptInputTextarea
                placeholder="What would you like to work on in this project?"
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
                    <span>Ask</span>
                    <ChevronDown className="size-3" />
                  </PromptInputButton>
                </PromptInputTools>
                <PromptInputTools>
                  <PromptInputButton>
                    <span>Legacy Model</span>
                    <ChevronDown className="size-3" />
                  </PromptInputButton>
                  <PromptInputSubmit />
                </PromptInputTools>
              </PromptInputFooter>
            </PromptInput>

            <div>
              <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Recents
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
          <CollapsibleCard title="Context" defaultOpen>
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
