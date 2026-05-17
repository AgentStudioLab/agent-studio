import type { Meta, StoryObj } from "@storybook/react-vite";
import { CustomizeNav } from "@/features/customize/CustomizeNav";

const meta: Meta<typeof CustomizeNav> = {
  title: "Features/Customize/CustomizeNav",
  component: CustomizeNav,
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
type Story = StoryObj<typeof CustomizeNav>;

export const HomeActive: Story = {
  args: { active: "home", onChange: () => {} },
};

export const SkillsActive: Story = {
  args: { active: "skills", onChange: () => {} },
};

export const AgentsActive: Story = {
  args: { active: "agents", onChange: () => {} },
};

export const PluginsActive: Story = {
  args: { active: "plugins", onChange: () => {} },
};

export const SideBySide: Story = {
  decorators: [],
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: "100vh" }}>
      <div style={{ display: "flex", background: "hsl(var(--bg-100))" }}>
        <CustomizeNav active="skills" onChange={() => {}} />
      </div>
      <div
        data-mode="dark"
        style={{ display: "flex", background: "hsl(var(--bg-100))" }}
      >
        <CustomizeNav active="skills" onChange={() => {}} />
      </div>
    </div>
  ),
};
