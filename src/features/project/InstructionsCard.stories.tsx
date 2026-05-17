import type { Meta, StoryObj } from "@storybook/react-vite";
import { InstructionsCard } from "@/features/project/InstructionsCard";
import { projects } from "@/lib/mock/projects";

const meta: Meta<typeof InstructionsCard> = {
  title: "Features/Project/InstructionsCard",
  component: InstructionsCard,
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
type Story = StoryObj<typeof InstructionsCard>;

export const Default: Story = {
  args: { instructions: projects[0]!.instructions },
};

export const Empty: Story = {
  args: { instructions: undefined },
};
