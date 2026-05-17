import type { Meta, StoryObj } from "@storybook/react-vite";
import { KeepAwakeBanner } from "@/features/scheduled/KeepAwakeBanner";

const meta: Meta<typeof KeepAwakeBanner> = {
  title: "Features/Scheduled/KeepAwakeBanner",
  component: KeepAwakeBanner,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div style={{ width: 720 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof KeepAwakeBanner>;

export const On: Story = { args: { defaultEnabled: true } };
export const Off: Story = { args: { defaultEnabled: false } };

export const SideBySide: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [],
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: "100vh" }}>
      <div style={{ background: "hsl(var(--bg-100))", padding: "2rem" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <KeepAwakeBanner defaultEnabled />
          <KeepAwakeBanner defaultEnabled={false} />
        </div>
      </div>
      <div data-mode="dark" style={{ background: "hsl(var(--bg-100))", padding: "2rem" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <KeepAwakeBanner defaultEnabled />
          <KeepAwakeBanner defaultEnabled={false} />
        </div>
      </div>
    </div>
  ),
};
