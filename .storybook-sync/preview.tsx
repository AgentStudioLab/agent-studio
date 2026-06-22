import type { Preview } from "@storybook/react-vite";
import { withThemeByDataAttribute } from "@storybook/addon-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import "../src/index.css";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { AuthProvider } from "../src/features/auth/AuthProvider";
import { AppShellProvider } from "../src/app/AppShellContext";
import { MessageQueueProvider } from "../src/features/task/MessageQueueContext";
import { defaultThemeId } from "../src/styles/themes/registry";

// 种下默认 data-brand（storybook 有自己的 <html>，否则品牌色不生效）。
if (typeof document !== "undefined") {
  document.documentElement.setAttribute("data-brand", defaultThemeId());
}

// retry:false：无 sidecar 时查询直接失败，视图回落到 loading/empty，而非刷屏重试。
const storyQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

// 复刻 App.tsx 根 provider 栈（QueryClient 在最外，因为 AuthProvider 用
// useQueryClient）。让依赖 useLocation/useAuth/useAppShell/useMessageQueue 的组件
// 能在 oracle 里正常渲染，并与 cfg.provider 包裹的预览一致。
const preview: Preview = {
  parameters: {
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
    backgrounds: { disable: true },
  },
  decorators: [
    withThemeByDataAttribute({
      themes: { light: "light", dark: "dark" },
      defaultTheme: "light",
      attributeName: "data-mode",
    }),
    (Story) => (
      <QueryClientProvider client={storyQueryClient}>
        <MemoryRouter>
          <AuthProvider>
            <AppShellProvider>
              <MessageQueueProvider>
                <TooltipProvider delayDuration={200}>
                  <div style={{ minHeight: "100vh", padding: "1rem" }}>
                    <Story />
                  </div>
                </TooltipProvider>
              </MessageQueueProvider>
            </AppShellProvider>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    ),
  ],
};

export default preview;
