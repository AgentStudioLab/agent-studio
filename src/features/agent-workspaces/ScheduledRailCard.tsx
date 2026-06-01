import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  NewScheduledModal,
  type NewScheduledFormData,
} from "@/features/scheduled/NewScheduledModal";
import {
  useCreateScheduledTaskMutation,
  useScheduledTasks,
} from "@/lib/data/scheduled-queries";
import { RailSection } from "./RailSection";

/** Scheduled rail card: this agent's recurring tasks. The ＋ dropdown lists
 *  existing tasks (quick-nav) and opens the create modal pre-bound to the
 *  agent (spawned runs inherit the agent home + memory + folders). */
export function ScheduledRailCard({ agentId }: { agentId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: tasks } = useScheduledTasks(agentId);
  const createTask = useCreateScheduledTaskMutation();
  const [modalOpen, setModalOpen] = useState(false);
  const list = tasks ?? [];

  const handleCreate = (data: NewScheduledFormData) => {
    createTask.mutate({
      name: data.name,
      description: data.description,
      prompt: data.prompt,
      frequency: data.frequency,
      timeOfDay: data.timeOfDay ?? null,
      weekday: data.weekday ?? null,
      workingDir: data.workingDir ?? null,
      model: data.model ?? null,
      permissionMode: data.permissionMode,
      agentWorkspaceId: agentId,
    });
  };

  const addAction = (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("agentSpace.scheduled.add")}
        className="shrink-0 rounded-md p-1 text-muted-foreground outline-hidden hover:bg-state-hover hover:text-foreground"
      >
        <Plus className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {list.length > 0 && (
          <>
            <DropdownMenuLabel>{t("agentSpace.scheduled.existingTasks")}</DropdownMenuLabel>
            {list.map((task) => (
              <DropdownMenuItem key={task.id} onSelect={() => navigate(`/scheduled/${task.id}`)}>
                <span className="truncate">{task.name}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onSelect={() => setModalOpen(true)}>
          <Plus className="size-4" />
          {t("agentSpace.scheduled.createNew")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <>
      <RailSection title={t("agentSpace.scheduled.title")} action={addAction}>
        {list.length === 0 ? (
          <p className="py-0.5 text-sm text-muted-foreground">
            {t("agentSpace.scheduled.description")}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {list.map((task) => (
              <li key={task.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/scheduled/${task.id}`)}
                  className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left outline-hidden hover:bg-state-hover"
                >
                  <span className="truncate text-sm font-medium text-foreground">
                    {task.name}
                  </span>
                  {task.description && (
                    <span className="truncate text-xs text-muted-foreground">
                      {task.description}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </RailSection>
      <NewScheduledModal open={modalOpen} onOpenChange={setModalOpen} onSave={handleCreate} />
    </>
  );
}
