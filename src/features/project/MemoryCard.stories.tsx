import type { Meta, StoryObj } from "@storybook/react-vite";
import { MemoryCard } from "@/features/project/MemoryCard";
import { projects } from "@/lib/mock/projects";

const meta: Meta<typeof MemoryCard> = {
  title: "Features/Project/MemoryCard",
  component: MemoryCard,
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
type Story = StoryObj<typeof MemoryCard>;

export const Default: Story = {
  args: { memory: projects[0]!.memory },
};

export const Empty: Story = {
  args: { memory: [] },
};

export const Embedded: Story = {
  args: { memory: projects[0]!.memory, embedded: true },
};
