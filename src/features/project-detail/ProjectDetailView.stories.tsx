import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppShellProvider } from "@/app/AppShellContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProjectDetailView } from "@/features/project-detail/ProjectDetailView";

const meta: Meta<typeof ProjectDetailView> = {
  title: "Views/ProjectDetailView",
  component: ProjectDetailView,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof ProjectDetailView>;

export const Default: Story = {
  render: () => (
    <AppShellProvider initialView="project-detail">
      <TooltipProvider delayDuration={200}>
        <ProjectDetailView />
      </TooltipProvider>
    </AppShellProvider>
  ),
};

export const SideBySide: Story = {
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: "100vh" }}>
      <div>
        <AppShellProvider initialView="project-detail">
          <TooltipProvider delayDuration={200}>
            <ProjectDetailView />
          </TooltipProvider>
        </AppShellProvider>
      </div>
      <div data-mode="dark">
        <AppShellProvider initialView="project-detail">
          <TooltipProvider delayDuration={200}>
            <ProjectDetailView />
          </TooltipProvider>
        </AppShellProvider>
      </div>
    </div>
  ),
};
