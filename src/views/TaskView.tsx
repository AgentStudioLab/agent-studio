import { AppShell } from "@/layouts/AppShell";
import { useAppShell } from "@/lib/AppShellContext";
import { TaskHeader } from "@/features/task/TaskHeader";
import { TaskChatStream } from "@/features/task/TaskChatStream";
import { TaskRightPanel } from "@/features/task/TaskRightPanel";
import { PreviewPane } from "@/features/task/PreviewPane";
import { inactiveProjectsTask } from "@/lib/mock/task";
import { workingTreeFiles } from "@/lib/mock/files";
import { loadedSkills } from "@/lib/mock/skills";
import { mcpServers } from "@/lib/mock/mcp-servers";
import type { Artifact } from "@/lib/mock/types";

export function TaskView() {
  const { preview, openPreview, closePreview, setView } = useAppShell();

  const handleOpenArtifact = (artifact: Artifact) => {
    const match = workingTreeFiles.find((f) => f.name === artifact.name);
    if (match) openPreview(match);
  };

  return (
    <AppShell
      main={
        <>
          <TaskHeader
            title={inactiveProjectsTask.title}
            onMoveToProject={() => setView("project-detail")}
          />
          <TaskChatStream
            messages={inactiveProjectsTask.messages}
            onOpenArtifact={handleOpenArtifact}
          />
        </>
      }
      aside={
        preview.open && preview.file ? (
          <PreviewPane file={preview.file} onClose={closePreview} />
        ) : (
          <TaskRightPanel
            task={inactiveProjectsTask}
            files={workingTreeFiles}
            skills={loadedSkills}
            mcpServers={mcpServers}
            onOpenFile={openPreview}
          />
        )
      }
    />
  );
}
