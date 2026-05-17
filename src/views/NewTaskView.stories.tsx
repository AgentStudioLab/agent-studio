import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppShellProvider } from "@/lib/AppShellContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NewTaskView } from "@/views/NewTaskView";

const meta: Meta<typeof NewTaskView> = {
  title: "Views/NewTaskView",
  component: NewTaskView,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof NewTaskView>;

export const Default: Story = {
  render: () => (
    <AppShellProvider>
      <TooltipProvider delayDuration={200}>
        <NewTaskView />
      </TooltipProvider>
    </AppShellProvider>
  ),
};

export const SideBySide: Story = {
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: "100vh" }}>
      <div>
        <AppShellProvider>
          <TooltipProvider delayDuration={200}>
            <NewTaskView />
          </TooltipProvider>
        </AppShellProvider>
      </div>
      <div data-mode="dark">
        <AppShellProvider>
          <TooltipProvider delayDuration={200}>
            <NewTaskView />
          </TooltipProvider>
        </AppShellProvider>
      </div>
    </div>
  ),
};
