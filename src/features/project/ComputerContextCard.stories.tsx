import type { Meta, StoryObj } from "@storybook/react-vite";
import { ComputerContextCard } from "@/features/project/ComputerContextCard";
import { projects } from "@/lib/mock/projects";

const meta: Meta<typeof ComputerContextCard> = {
  title: "Features/Project/ComputerContextCard",
  component: ComputerContextCard,
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
type Story = StoryObj<typeof ComputerContextCard>;

export const Default: Story = {
  args: { context: projects[0]!.computerContext },
};

export const Empty: Story = {
  args: { context: [] },
};

export const Embedded: Story = {
  args: { context: projects[0]!.computerContext, embedded: true },
};
