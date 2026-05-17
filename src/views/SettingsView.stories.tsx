import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppShellProvider } from "@/lib/AppShellContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SettingsView } from "@/views/SettingsView";

const meta: Meta<typeof SettingsView> = {
  title: "Views/SettingsView",
  component: SettingsView,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof SettingsView>;

export const Default: Story = {
  render: () => (
    <AppShellProvider initialView="settings">
      <TooltipProvider delayDuration={200}>
        <SettingsView />
      </TooltipProvider>
    </AppShellProvider>
  ),
};

export const SideBySide: Story = {
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: "100vh" }}>
      <div>
        <AppShellProvider initialView="settings">
          <TooltipProvider delayDuration={200}>
            <SettingsView />
          </TooltipProvider>
        </AppShellProvider>
      </div>
      <div data-mode="dark">
        <AppShellProvider initialView="settings">
          <TooltipProvider delayDuration={200}>
            <SettingsView />
          </TooltipProvider>
        </AppShellProvider>
      </div>
    </div>
  ),
};
