import { useAppShell } from "@/app/AppShellContext";
import { TaskView } from "@/features/task/TaskView";
import { NewTaskView } from "@/features/new-task/NewTaskView";
import { ProjectsView } from "@/features/projects/ProjectsView";
import { ProjectDetailView } from "@/features/project-detail/ProjectDetailView";
import { ScheduledListView } from "@/features/scheduled/ScheduledListView";
import { ScheduledDetailView } from "@/features/scheduled/ScheduledDetailView";
import { CustomizeView } from "@/features/customize/CustomizeView";
import { SettingsView } from "@/features/settings/SettingsView";

export function RouterView() {
  const { currentView } = useAppShell();
  switch (currentView) {
    case "new-task":
      return <NewTaskView />;
    case "task":
      return <TaskView />;
    case "projects":
      return <ProjectsView />;
    case "project-detail":
      return <ProjectDetailView />;
    case "scheduled-list":
      return <ScheduledListView />;
    case "scheduled-detail":
      return <ScheduledDetailView />;
    case "customize":
      return <CustomizeView />;
    case "settings":
      return <SettingsView />;
  }
}
