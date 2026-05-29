import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppShellProvider } from "@/app/AppShellContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CustomizeView } from "@/features/customize/CustomizeView";

const meta: Meta<typeof CustomizeView> = {
  title: "Views/CustomizeView",
  component: CustomizeView,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof CustomizeView>;

export const Default: Story = {
  render: () => (
    <AppShellProvider>
      <TooltipProvider delayDuration={200}>
        <CustomizeView />
      </TooltipProvider>
    </AppShellProvider>
  ),
};

export const SkillsActive: Story = {
  render: () => (
    <AppShellProvider>
      <TooltipProvider delayDuration={200}>
        <CustomizeView initialSection="skills" />
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
            <CustomizeView initialSection="skills" />
          </TooltipProvider>
        </AppShellProvider>
      </div>
      <div data-mode="dark">
        <AppShellProvider>
          <TooltipProvider delayDuration={200}>
            <CustomizeView initialSection="skills" />
          </TooltipProvider>
        </AppShellProvider>
      </div>
    </div>
  ),
};
