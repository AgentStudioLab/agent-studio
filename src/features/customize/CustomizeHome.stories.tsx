import type { Meta, StoryObj } from "@storybook/react-vite";
import { CustomizeHome } from "@/features/customize/CustomizeHome";

const meta: Meta<typeof CustomizeHome> = {
  title: "Features/Customize/CustomizeHome",
  component: CustomizeHome,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ height: "100vh", background: "hsl(var(--bg-100))" }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof CustomizeHome>;

export const Default: Story = {
  args: { onSelectAction: () => {} },
};

export const SideBySide: Story = {
  decorators: [],
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: "100vh" }}>
      <div style={{ background: "hsl(var(--bg-100))" }}>
        <CustomizeHome onSelectAction={() => {}} />
      </div>
      <div data-mode="dark" style={{ background: "hsl(var(--bg-100))" }}>
        <CustomizeHome onSelectAction={() => {}} />
      </div>
    </div>
  ),
};
