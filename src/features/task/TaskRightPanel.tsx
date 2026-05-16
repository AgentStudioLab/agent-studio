import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ProcessTab } from "@/features/task/ProcessTab";
import { FilesTab } from "@/features/task/FilesTab";
import { ContextTab } from "@/features/task/ContextTab";
import type { MockTask, MockFile, MockSkill, MockMcpServer } from "@/lib/mock/types";

interface TaskRightPanelProps {
  task: MockTask;
  files: MockFile[];
  skills: MockSkill[];
  mcpServers: MockMcpServer[];
  onOpenFile?: (file: MockFile) => void;
}

export function TaskRightPanel({ task, files, skills, mcpServers, onOpenFile }: TaskRightPanelProps) {
  return (
    <Tabs defaultValue="process" className="flex h-full flex-col gap-0">
      <TabsList className="m-2 self-start">
        <TabsTrigger value="process">Process</TabsTrigger>
        <TabsTrigger value="files">Files</TabsTrigger>
        <TabsTrigger value="context">Context</TabsTrigger>
      </TabsList>
      <TabsContent value="process" className="flex-1 overflow-hidden">
        <ProcessTab task={task} />
      </TabsContent>
      <TabsContent value="files" className="flex-1 overflow-hidden">
        <FilesTab files={files} onOpenFile={onOpenFile} />
      </TabsContent>
      <TabsContent value="context" className="flex-1 overflow-hidden">
        <ContextTab skills={skills} mcpServers={mcpServers} />
      </TabsContent>
    </Tabs>
  );
}
