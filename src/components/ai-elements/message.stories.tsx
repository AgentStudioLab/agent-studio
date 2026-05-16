import type { Meta, StoryObj } from "@storybook/react-vite";
import { Message, MessageContent } from "@/components/ai-elements/message";

const meta: Meta<typeof Message> = {
  title: "AI Elements/Message",
  component: Message,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof Message>;

export const User: Story = {
  args: {
    from: "user",
    children: <MessageContent>扫描 ~/Workspace 找出不活跃项目，生成 xlsx + pptx 报表</MessageContent>,
  },
};

export const Assistant: Story = {
  args: {
    from: "assistant",
    children: (
      <MessageContent>
        好的，我会先扫描你的工作目录，按最近一次 git commit 排序找出不活跃项目，
        然后生成两份文件给你。
      </MessageContent>
    ),
  },
};

export const Conversation: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: "640px" }}>
      <Message from="user">
        <MessageContent>扫描 ~/Workspace 找出不活跃项目</MessageContent>
      </Message>
      <Message from="assistant">
        <MessageContent>正在扫描…</MessageContent>
      </Message>
      <Message from="user">
        <MessageContent>同时生成 xlsx 和 pptx 报表</MessageContent>
      </Message>
      <Message from="assistant">
        <MessageContent>已完成。文件保存在 ~/Workspace/inactive-report/。</MessageContent>
      </Message>
    </div>
  ),
};

export const SideBySide: Story = {
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
      <div style={{ background: "hsl(var(--bg-100))", padding: "1rem" }}>
        <Message from="user">
          <MessageContent>测试消息</MessageContent>
        </Message>
      </div>
      <div data-mode="dark" style={{ background: "hsl(var(--bg-100))", padding: "1rem" }}>
        <Message from="user">
          <MessageContent>测试消息</MessageContent>
        </Message>
      </div>
    </div>
  ),
};
