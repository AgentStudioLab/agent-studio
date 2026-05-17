import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppShellProvider } from "@/app/AppShellContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ScheduledListView } from "@/features/scheduled/ScheduledListView";

const meta: Meta<typeof ScheduledListView> = {
  title: "Views/ScheduledListView",
  component: ScheduledListView,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof ScheduledListView>;

export const Default: Story = {
  render: () => (
    <AppShellProvider initialView="scheduled-list">
      <TooltipProvider delayDuration={200}>
        <ScheduledListView />
      </TooltipProvider>
    </AppShellProvider>
  ),
};

export const SideBySide: Story = {
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: "100vh" }}>
      <div>
        <AppShellProvider initialView="scheduled-list">
          <TooltipProvider delayDuration={200}>
            <ScheduledListView />
          </TooltipProvider>
        </AppShellProvider>
      </div>
      <div data-mode="dark">
        <AppShellProvider initialView="scheduled-list">
          <TooltipProvider delayDuration={200}>
            <ScheduledListView />
          </TooltipProvider>
        </AppShellProvider>
      </div>
    </div>
  ),
};
