import type { Meta, StoryObj } from "@storybook/react-vite";
import { TaskChatStream } from "@/features/task/TaskChatStream";
import { inactiveProjectsTask } from "@/lib/mock/task";

const meta: Meta<typeof TaskChatStream> = {
  title: "Features/Task/TaskChatStream",
  component: TaskChatStream,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof TaskChatStream>;

const allMessages = inactiveProjectsTask.messages;

export const SingleUser: Story = {
  args: { messages: allMessages.slice(0, 1) },
};

export const Round1: Story = {
  args: { messages: allMessages.slice(0, 2) },
};

export const Round2: Story = {
  args: { messages: allMessages.slice(2, 4) },
};

export const Round3: Story = {
  args: { messages: allMessages.slice(4, 6) },
};

export const FullConversation: Story = {
  args: { messages: allMessages },
};

export const SideBySide: Story = {
  parameters: { layout: "fullscreen" },
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
      <div style={{ background: "hsl(var(--bg-100))", padding: "1.5rem" }}>
        <TaskChatStream messages={allMessages} />
      </div>
      <div
        data-mode="dark"
        style={{ background: "hsl(var(--bg-100))", padding: "1.5rem" }}
      >
        <TaskChatStream messages={allMessages} />
      </div>
    </div>
  ),
};
