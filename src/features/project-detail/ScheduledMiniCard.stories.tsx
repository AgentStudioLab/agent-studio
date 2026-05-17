import type { Meta, StoryObj } from "@storybook/react-vite";
import { ScheduledMiniCard } from "@/features/project-detail/ScheduledMiniCard";
import { projects } from "@/lib/mock/projects";

const meta: Meta<typeof ScheduledMiniCard> = {
  title: "Features/Project/ScheduledMiniCard",
  component: ScheduledMiniCard,
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
type Story = StoryObj<typeof ScheduledMiniCard>;

export const Default: Story = {
  args: { scheduledTaskIds: projects[0]!.scheduledTasks },
};

export const Empty: Story = {
  args: { scheduledTaskIds: [] },
};
