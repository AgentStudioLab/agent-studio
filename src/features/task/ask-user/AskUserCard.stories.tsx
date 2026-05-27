import type { Meta, StoryObj } from "@storybook/react-vite";
import { AskUserCard } from "./AskUserCard";
import type { AskUserQuestionDef } from "./types";

const meta: Meta<typeof AskUserCard> = {
  title: "Features/Task/AskUserCard",
  component: AskUserCard,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div style={{ width: 560, background: "hsl(var(--bg-100))", padding: 16 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof AskUserCard>;

const SINGLE: AskUserQuestionDef = {
  question: "这个 PPT 介绍的是什么项目？请简单描述项目名称和背景。",
  header: "项目信息",
  multiSelect: false,
  options: [
    { label: "告诉我项目详情", description: "我会提供项目名称、背景和具体内容" },
    { label: "先看通用模板", description: "你先做一个通用框架，我再填充" },
    { label: "示范项目参考", description: "用一个示例项目来展示效果" },
  ],
};

const MULTI: AskUserQuestionDef = {
  question: "你希望 PPT 包含哪些核心板块？（可多选）",
  header: "内容板块",
  multiSelect: true,
  options: [
    { label: "项目背景与目标", description: "为什么做、解决什么问题" },
    { label: "核心功能亮点", description: "主要功能模块与创新点" },
    { label: "技术架构", description: "系统架构、技术栈" },
    { label: "成果与规划", description: "当前成果与未来 roadmap" },
  ],
};

export const SingleQuestion: Story = {
  args: {
    questions: [SINGLE],
    onSubmit: (d) => console.log("[AskUserCard] submit", d),
  },
};

export const MultiSelectQuestion: Story = {
  args: {
    questions: [MULTI],
    onSubmit: (d) => console.log("[AskUserCard] submit", d),
  },
};

export const FullFlow: Story = {
  args: {
    questions: [
      SINGLE,
      {
        question: "PPT 的受众是谁？",
        header: "目标受众",
        multiSelect: false,
        options: [
          { label: "管理层/决策者", description: "侧重宏观价值、ROI、战略意义" },
          { label: "技术团队", description: "侧重技术架构、实现方案" },
          { label: "客户/外部", description: "侧重产品能力、案例、商业价值" },
          { label: "综合/不限", description: "兼顾技术和非技术 audience" },
        ],
      },
      {
        question: "你希望用哪种视觉风格？",
        header: "视觉风格",
        multiSelect: false,
        options: [
          { label: "沉稳专业", description: "深蓝+冰蓝，Midnight Executive 风格" },
          { label: "现代清新", description: "青绿+海蓝，Teal Trust 风格" },
          { label: "温暖独特", description: "陶土红+沙色，Warm Terracotta 风格" },
          { label: "你来推荐", description: "你根据项目主题帮我推荐一个" },
        ],
      },
      MULTI,
    ],
    onSubmit: (d) => console.log("[AskUserCard] submit", d),
  },
};
