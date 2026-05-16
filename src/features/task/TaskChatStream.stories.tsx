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

export const SingleAssistant: Story = {
  args: { messages: allMessages.slice(1, 2) },
};

export const WithToolCalls: Story = {
  args: { messages: allMessages.slice(0, 2) },
};

export const WithArtifacts: Story = {
  args: { messages: allMessages.slice(3, 4) },
};

export const FullConversation: Story = {
  args: { messages: allMessages },
};

export const SideBySide: Story = {
  parameters: { layout: "fullscreen" },
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
      <div style={{ background: "hsl(var(--bg-100))" }}>
        <TaskChatStream messages={allMessages} />
      </div>
      <div data-mode="dark" style={{ background: "hsl(var(--bg-100))" }}>
        <TaskChatStream messages={allMessages} />
      </div>
    </div>
  ),
};
