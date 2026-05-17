import type { Meta, StoryObj } from "@storybook/react-vite";
import { AgentDetail } from "@/features/customize/AgentDetail";
import { agents } from "@/lib/mock/agents";

const meta: Meta<typeof AgentDetail> = {
  title: "Features/Customize/AgentDetail",
  component: AgentDetail,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ padding: "2rem", background: "hsl(var(--bg-100))" }}>
        <div style={{ maxWidth: 720 }}>
          <Story />
        </div>
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof AgentDetail>;

export const ComputerKeeper: Story = {
  args: { agent: agents.find((a) => a.id === "agent-computer-keeper")! },
};

export const Office: Story = {
  args: { agent: agents.find((a) => a.id === "agent-office")! },
};

export const Research: Story = {
  args: { agent: agents.find((a) => a.id === "agent-research")! },
};

export const Design: Story = {
  args: { agent: agents.find((a) => a.id === "agent-design")! },
};

export const Writing: Story = {
  args: { agent: agents.find((a) => a.id === "agent-writing")! },
};

export const DataAnalyst: Story = {
  args: { agent: agents.find((a) => a.id === "agent-data-analyst")! },
};

export const SideBySide: Story = {
  decorators: [],
  render: () => {
    const agent = agents[0]!;
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          minHeight: "100vh",
        }}
      >
        <div style={{ background: "hsl(var(--bg-100))", padding: "2rem" }}>
          <div style={{ maxWidth: 720 }}>
            <AgentDetail agent={agent} />
          </div>
        </div>
        <div
          data-mode="dark"
          style={{ background: "hsl(var(--bg-100))", padding: "2rem" }}
        >
          <div style={{ maxWidth: 720 }}>
            <AgentDetail agent={agent} />
          </div>
        </div>
      </div>
    );
  },
};
