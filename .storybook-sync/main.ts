import type { StorybookConfig } from "@storybook/react-vite";

// design-sync 专用 storybook 配置。复用仓库的 stories 与 addons，但 preview 用
// 「App.tsx 根 provider 栈」包裹，使依赖 Router/Auth/AppShell/MessageQueue 的组件
// （如 SkillsBody/TaskHeader）能在 oracle 里渲染。仓库自带的 .storybook/ 保持不动。
//
// 必须放在仓库根：storybook 会把 Vite root 设为「配置目录的父目录」，进而从那里加载
// vite.config.ts（含 @tailwindcss/vite 插件）。放在 .design-sync/ 子目录会让 root 落在
// .design-sync/、加载不到 vite.config、Tailwind 工具类全不生成、组件无样式。
const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: [
    "@storybook/addon-docs",
    "@storybook/addon-a11y",
    "@storybook/addon-themes",
  ],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  typescript: {
    reactDocgen: "react-docgen-typescript",
  },
};

export default config;
