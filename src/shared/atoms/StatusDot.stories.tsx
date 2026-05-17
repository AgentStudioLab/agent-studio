import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatusDot } from "@/shared/atoms/StatusDot";

const meta: Meta<typeof StatusDot> = {
  title: "Atoms/StatusDot",
  component: StatusDot,
  parameters: { layout: "centered" },
};
export default meta;
type Story = StoryObj<typeof StatusDot>;

export const Done: Story = { args: { status: "done" } };
export const Active: Story = { args: { status: "active" } };
export const Pending: Story = { args: { status: "pending" } };
export const Failed: Story = { args: { status: "failed" } };

export const AllStates: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <StatusDot status="done" />
      <StatusDot status="active" />
      <StatusDot status="pending" />
      <StatusDot status="failed" />
    </div>
  ),
};

export const SideBySide: Story = {
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
      <div style={{ background: "hsl(var(--bg-100))", padding: "1rem" }}>
        <div className="flex items-center gap-3">
          <StatusDot status="done" />
          <StatusDot status="active" />
          <StatusDot status="pending" />
          <StatusDot status="failed" />
        </div>
      </div>
      <div
        data-mode="dark"
        style={{ background: "hsl(var(--bg-100))", padding: "1rem" }}
      >
        <div className="flex items-center gap-3">
          <StatusDot status="done" />
          <StatusDot status="active" />
          <StatusDot status="pending" />
          <StatusDot status="failed" />
        </div>
      </div>
    </div>
  ),
};
