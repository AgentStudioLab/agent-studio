import type { Meta, StoryObj } from "@storybook/react-vite";
import { AgentCard } from "@/features/customize/AgentCard";
import { agents } from "@/lib/mock/agents";

const meta: Meta<typeof AgentCard> = {
  title: "Features/Customize/AgentCard",
  component: AgentCard,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof AgentCard>;

const myAgent = agents.find((a) => a.category === "my")!;
const builtInAgent = agents.find((a) => a.category === "built-in")!;

export const Default: Story = {
  args: { agent: myAgent, active: false },
};

export const Active: Story = {
  args: { agent: myAgent, active: true },
};

export const MyCategory: Story = {
  args: { agent: myAgent },
};

export const BuiltInCategory: Story = {
  args: { agent: builtInAgent },
};

export const SideBySide: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [],
  render: () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        minHeight: "100vh",
      }}
    >
      <div style={{ background: "hsl(var(--bg-100))", padding: "2rem" }}>
        <div style={{ width: 320, display: "flex", flexDirection: "column", gap: 4 }}>
          <AgentCard agent={myAgent} active />
          <AgentCard agent={builtInAgent} />
        </div>
      </div>
      <div
        data-mode="dark"
        style={{ background: "hsl(var(--bg-100))", padding: "2rem" }}
      >
        <div style={{ width: 320, display: "flex", flexDirection: "column", gap: 4 }}>
          <AgentCard agent={myAgent} active />
          <AgentCard agent={builtInAgent} />
        </div>
      </div>
    </div>
  ),
};
