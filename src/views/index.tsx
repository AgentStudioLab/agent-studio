import { useAppShell } from "@/lib/AppShellContext";
import { TaskView } from "@/views/TaskView";
import { NewTaskView } from "@/views/NewTaskView";
import { ProjectsView } from "@/views/ProjectsView";
import { ProjectDetailView } from "@/views/ProjectDetailView";
import { ScheduledListView } from "@/views/ScheduledListView";
import { ScheduledDetailView } from "@/views/ScheduledDetailView";
import { CustomizeView } from "@/views/CustomizeView";
import { SettingsView } from "@/views/SettingsView";

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
