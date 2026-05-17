import type { Meta, StoryObj } from "@storybook/react-vite";
import { AppShell } from "@/app/AppShell";
import { AppShellProvider } from "@/app/AppShellContext";

const meta: Meta<typeof AppShell> = {
  title: "Layouts/AppShell",
  component: AppShell,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <AppShellProvider>
        <Story />
      </AppShellProvider>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof AppShell>;

const MainPlaceholder = () => (
  <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
    Main content area
  </div>
);

const AsidePlaceholder = () => (
  <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
    Right panel
  </div>
);

export const Default: Story = {
  render: () => <AppShell main={<MainPlaceholder />} aside={<AsidePlaceholder />} />,
};

export const NoAside: Story = {
  render: () => <AppShell main={<MainPlaceholder />} />,
};

export const SideBySide: Story = {
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: "100vh" }}>
      <div style={{ overflow: "hidden" }}>
        <AppShellProvider>
          <AppShell main={<MainPlaceholder />} aside={<AsidePlaceholder />} />
        </AppShellProvider>
      </div>
      <div data-mode="dark" style={{ overflow: "hidden" }}>
        <AppShellProvider>
          <AppShell main={<MainPlaceholder />} aside={<AsidePlaceholder />} />
        </AppShellProvider>
      </div>
    </div>
  ),
};
