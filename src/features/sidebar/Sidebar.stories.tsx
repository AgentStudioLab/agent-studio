import type { Meta, StoryObj } from "@storybook/react-vite";
import { Sidebar } from "@/features/sidebar/Sidebar";
import { AppShellProvider } from "@/app/AppShellContext";

const meta: Meta<typeof Sidebar> = {
  title: "Features/Sidebar/Sidebar",
  component: Sidebar,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <AppShellProvider>
        <div style={{ height: "100vh", display: "flex" }}>
          <Story />
          <div className="flex-1 bg-background" />
        </div>
      </AppShellProvider>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof Sidebar>;

export const Default: Story = {
  render: () => <Sidebar />,
};

export const SideBySide: Story = {
  decorators: [],
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: "100vh" }}>
      <div style={{ overflow: "hidden" }}>
        <AppShellProvider>
          <div className="flex h-full">
            <Sidebar />
            <div className="flex-1 bg-background" />
          </div>
        </AppShellProvider>
      </div>
      <div data-mode="dark" style={{ overflow: "hidden" }}>
        <AppShellProvider>
          <div className="flex h-full">
            <Sidebar />
            <div className="flex-1 bg-background" />
          </div>
        </AppShellProvider>
      </div>
    </div>
  ),
};
