import type { Meta, StoryObj } from "@storybook/react-vite";
import { ContextTab } from "@/features/task/ContextTab";
import { loadedSkills } from "@/lib/mock/skills";
import { mcpServers } from "@/lib/mock/mcp-servers";

const meta: Meta<typeof ContextTab> = {
  title: "Features/Task/ContextTab",
  component: ContextTab,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ width: 320, height: 480, background: "hsl(var(--bg-100))" }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof ContextTab>;

export const Default: Story = {
  args: { skills: loadedSkills, mcpServers: mcpServers },
};

export const EmptyMcp: Story = {
  args: { skills: loadedSkills, mcpServers: [] },
};

export const SideBySide: Story = {
  parameters: { layout: "fullscreen" },
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", padding: "1rem" }}>
      <div style={{ width: 320, height: 480, background: "hsl(var(--bg-100))" }}>
        <ContextTab skills={loadedSkills} mcpServers={mcpServers} />
      </div>
      <div data-mode="dark" style={{ width: 320, height: 480, background: "hsl(var(--bg-100))" }}>
        <ContextTab skills={loadedSkills} mcpServers={mcpServers} />
      </div>
    </div>
  ),
};
