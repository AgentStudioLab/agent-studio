import { Navigate, Route, Routes } from "react-router-dom";
import { TaskView } from "@/features/task/TaskView";
import { NewTaskView } from "@/features/new-task/NewTaskView";
import { ProjectsView } from "@/features/projects/ProjectsView";
import { ProjectDetailView } from "@/features/project-detail/ProjectDetailView";
import { ScheduledListView } from "@/features/scheduled/ScheduledListView";
import { ScheduledDetailView } from "@/features/scheduled/ScheduledDetailView";
import { CustomizeView } from "@/features/customize/CustomizeView";
import { SettingsLayout } from "@/features/settings/SettingsLayout";
import { AccountSection } from "@/features/settings/sections/AccountSection";
import { ModelSection } from "@/features/settings/sections/ModelSection";
import { PermissionsSection } from "@/features/settings/sections/PermissionsSection";
import { AppearanceSection } from "@/features/settings/sections/AppearanceSection";

/**
 * Route ↔ view mapping. Entity ids (threadId, projectId, scheduledId) come
 * via path params instead of context state — the view subscribes to URL via
 * `useParams`, so a Tauri webview reload or a deep-link restores the same
 * destination. Back navigation uses `useNavigate(-1)` which walks the real
 * history stack rather than guessing the previous view.
 */
export function RouterView() {
  return (
    <Routes>
      <Route path="/" element={<NewTaskView />} />
      <Route path="/task/:threadId" element={<TaskView />} />
      <Route path="/projects" element={<ProjectsView />} />
      <Route path="/projects/:projectId" element={<ProjectDetailView />} />
      <Route path="/scheduled" element={<ScheduledListView />} />
      <Route path="/scheduled/:scheduledId" element={<ScheduledDetailView />} />
      <Route path="/customize" element={<CustomizeView />} />
      <Route path="/settings" element={<SettingsLayout />}>
        {/* `index` lands on Account when the user clicks "Settings" from the
            sidebar — avoids a blank pane in the middle. */}
        <Route index element={<Navigate to="account" replace />} />
        <Route path="account" element={<AccountSection />} />
        <Route path="model" element={<ModelSection />} />
        <Route path="permissions" element={<PermissionsSection />} />
        <Route path="appearance" element={<AppearanceSection />} />
      </Route>
      {/* Unknown URLs land on the New Task screen rather than a blank route. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
