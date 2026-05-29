import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppShellProvider } from "@/app/AppShellContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ScheduledDetailView } from "@/features/scheduled/ScheduledDetailView";

const meta: Meta<typeof ScheduledDetailView> = {
  title: "Views/ScheduledDetailView",
  component: ScheduledDetailView,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof ScheduledDetailView>;

export const Default: Story = {
  render: () => (
    <AppShellProvider>
      <TooltipProvider delayDuration={200}>
        <ScheduledDetailView />
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
            <ScheduledDetailView />
          </TooltipProvider>
        </AppShellProvider>
      </div>
      <div data-mode="dark">
        <AppShellProvider>
          <TooltipProvider delayDuration={200}>
            <ScheduledDetailView />
          </TooltipProvider>
        </AppShellProvider>
      </div>
    </div>
  ),
};
