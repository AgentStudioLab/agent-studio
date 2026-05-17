import type { Meta, StoryObj } from "@storybook/react-vite";
import { SkillsBody } from "@/features/customize/SkillsBody";

const meta: Meta<typeof SkillsBody> = {
  title: "Features/Customize/SkillsBody",
  component: SkillsBody,
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
type Story = StoryObj<typeof SkillsBody>;

export const Default: Story = {};

export const SideBySide: Story = {
  decorators: [],
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: "100vh" }}>
      <div style={{ display: "flex", background: "hsl(var(--bg-100))" }}>
        <SkillsBody />
      </div>
      <div data-mode="dark" style={{ display: "flex", background: "hsl(var(--bg-100))" }}>
        <SkillsBody />
      </div>
    </div>
  ),
};
