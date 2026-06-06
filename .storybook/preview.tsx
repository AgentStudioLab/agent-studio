/**
 * Anti-AI-slop rules — enforce in every story / component:
 *
 * ❌ Purple gradients               → use single accent (brand-100 orange only)
 * ❌ Emoji icons in decorative role → use lucide-react inline SVG
 * ❌ Left-border colored bar (l-4)  → use top-strip or full-card hue tinting
 * ❌ SVG-drawn faces / portraits    → use InitialsAvatar (letter blocks)
 *
 * Failing any of these in a PR review is a hard block, not a nit.
 * Anthropic visual identity is restraint: warm neutrals, single brand
 * orange, serif display, sans body, alpha borders. See PRD § 5.4 and
 * the design-tokens skill.
 */
import type { Preview } from "@storybook/react-vite";
import { withThemeByDataAttribute } from "@storybook/addon-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "../src/index.css";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { defaultThemeId } from "../src/styles/themes/registry";

// Brand themes live on the `data-brand` axis (the app ships it on <html> in
// index.html). Storybook has its own <html>, so seed the default brand here —
// otherwise stories render without their brand/accent colors.
if (typeof document !== "undefined") {
  document.documentElement.setAttribute("data-brand", defaultThemeId());
}

// Data-driven views (e.g. ScheduledListView) call react-query hooks. Storybook
// has no sidecar, so queries reject and the views show their loading/empty
// state — but they need a provider in scope to not throw. retry:false keeps
// failed fetches from spamming.
const storyQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
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
        <TooltipProvider delayDuration={200}>
          <div style={{ minHeight: "100vh", padding: "1rem" }}>
            <Story />
          </div>
        </TooltipProvider>
      </QueryClientProvider>
    ),
  ],
};

export default preview;
