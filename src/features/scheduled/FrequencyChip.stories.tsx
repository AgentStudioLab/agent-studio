import type { Meta, StoryObj } from "@storybook/react-vite";
import { FrequencyChip } from "@/features/scheduled/FrequencyChip";

const meta: Meta<typeof FrequencyChip> = {
  title: "Features/Scheduled/FrequencyChip",
  component: FrequencyChip,
  parameters: { layout: "centered" },
};
export default meta;
type Story = StoryObj<typeof FrequencyChip>;

export const Manual: Story = { args: { frequency: "manual" } };
export const Hourly: Story = { args: { frequency: "hourly" } };
export const Daily: Story = { args: { frequency: "daily", timeOfDay: "09:00" } };
export const Weekdays: Story = { args: { frequency: "weekdays", timeOfDay: "12:30" } };
export const Weekly: Story = { args: { frequency: "weekly", timeOfDay: "21:00" } };

export const SideBySide: Story = {
  parameters: { layout: "fullscreen" },
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: "100vh" }}>
      <div style={{ background: "hsl(var(--bg-100))", padding: "2rem" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", alignItems: "flex-start" }}>
          <FrequencyChip frequency="manual" />
          <FrequencyChip frequency="hourly" />
          <FrequencyChip frequency="daily" timeOfDay="09:00" />
          <FrequencyChip frequency="weekdays" timeOfDay="12:30" />
          <FrequencyChip frequency="weekly" timeOfDay="21:00" />
        </div>
      </div>
      <div data-mode="dark" style={{ background: "hsl(var(--bg-100))", padding: "2rem" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", alignItems: "flex-start" }}>
          <FrequencyChip frequency="manual" />
          <FrequencyChip frequency="hourly" />
          <FrequencyChip frequency="daily" timeOfDay="09:00" />
          <FrequencyChip frequency="weekdays" timeOfDay="12:30" />
          <FrequencyChip frequency="weekly" timeOfDay="21:00" />
        </div>
      </div>
    </div>
  ),
};
