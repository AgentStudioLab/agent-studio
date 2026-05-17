import { useEffect } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppShellProvider, useAppShell } from "@/app/AppShellContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TaskView } from "@/features/task/TaskView";
import { workingTreeFiles } from "@/lib/mock/files";
import type { MockFile } from "@/lib/mock/types";

function OpenPreviewOnMount({ file }: { file: MockFile }) {
  const { openPreview } = useAppShell();
  useEffect(() => {
    openPreview(file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

const meta: Meta<typeof TaskView> = {
  title: "Views/TaskView",
  component: TaskView,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof TaskView>;

export const Default: Story = {
  render: () => (
    <AppShellProvider>
      <TooltipProvider delayDuration={200}>
        <TaskView />
      </TooltipProvider>
    </AppShellProvider>
  ),
};

export const WithMarkdownPreview: Story = {
  render: () => {
    const initial = workingTreeFiles.find((f) => f.type === "markdown")!;
    return (
      <AppShellProvider>
        <TooltipProvider delayDuration={200}>
          <OpenPreviewOnMount file={initial} />
          <TaskView />
        </TooltipProvider>
      </AppShellProvider>
    );
  },
};

export const WithSpreadsheetPreview: Story = {
  render: () => {
    const initial = workingTreeFiles.find((f) => f.type === "spreadsheet")!;
    return (
      <AppShellProvider>
        <TooltipProvider delayDuration={200}>
          <OpenPreviewOnMount file={initial} />
          <TaskView />
        </TooltipProvider>
      </AppShellProvider>
    );
  },
};
