import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppShellProvider } from "@/lib/AppShellContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProjectsView } from "@/views/ProjectsView";

const meta: Meta<typeof ProjectsView> = {
  title: "Views/ProjectsView",
  component: ProjectsView,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof ProjectsView>;

export const Default: Story = {
  render: () => (
    <AppShellProvider initialView="projects">
      <TooltipProvider delayDuration={200}>
        <ProjectsView />
      </TooltipProvider>
    </AppShellProvider>
  ),
};

export const SideBySide: Story = {
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: "100vh" }}>
      <div>
        <AppShellProvider initialView="projects">
          <TooltipProvider delayDuration={200}>
            <ProjectsView />
          </TooltipProvider>
        </AppShellProvider>
      </div>
      <div data-mode="dark">
        <AppShellProvider initialView="projects">
          <TooltipProvider delayDuration={200}>
            <ProjectsView />
          </TooltipProvider>
        </AppShellProvider>
      </div>
    </div>
  ),
};
