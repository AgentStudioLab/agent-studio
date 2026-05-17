import type { Meta, StoryObj } from "@storybook/react-vite";
import { AgentsBody } from "@/features/customize/AgentsBody";

const meta: Meta<typeof AgentsBody> = {
  title: "Features/Customize/AgentsBody",
  component: AgentsBody,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ height: "100vh", display: "flex" }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof AgentsBody>;

export const Default: Story = {};

export const SideBySide: Story = {
  decorators: [],
  render: () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        height: "100vh",
      }}
    >
      <div style={{ display: "flex", background: "hsl(var(--bg-100))" }}>
        <AgentsBody />
      </div>
      <div
        data-mode="dark"
        style={{ display: "flex", background: "hsl(var(--bg-100))" }}
      >
        <AgentsBody />
      </div>
    </div>
  ),
};
