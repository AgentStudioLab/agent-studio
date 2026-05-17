import type { Meta, StoryObj } from "@storybook/react-vite";
import { InitialsAvatar } from "@/shared/atoms/InitialsAvatar";

const meta: Meta<typeof InitialsAvatar> = {
  title: "Atoms/InitialsAvatar",
  component: InitialsAvatar,
  parameters: { layout: "centered" },
};
export default meta;
type Story = StoryObj<typeof InitialsAvatar>;

export const Default: Story = {
  args: { initials: "JY", hue: "orange" },
};

export const AllHues: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <InitialsAvatar initials="OR" hue="orange" />
      <InitialsAvatar initials="BL" hue="blue" />
      <InitialsAvatar initials="PU" hue="purple" />
      <InitialsAvatar initials="RE" hue="red" />
      <InitialsAvatar initials="GR" hue="green" />
      <InitialsAvatar initials="AM" hue="amber" />
      <InitialsAvatar initials="ST" hue="stone" />
    </div>
  ),
};

export const Large: Story = {
  args: { initials: "JY", hue: "orange", size: 64 },
};

export const SideBySide: Story = {
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
      <div style={{ background: "hsl(var(--bg-100))", padding: "1rem" }}>
        <InitialsAvatar initials="JY" hue="orange" />
      </div>
      <div
        data-mode="dark"
        style={{ background: "hsl(var(--bg-100))", padding: "1rem" }}
      >
        <InitialsAvatar initials="JY" hue="orange" />
      </div>
    </div>
  ),
};
