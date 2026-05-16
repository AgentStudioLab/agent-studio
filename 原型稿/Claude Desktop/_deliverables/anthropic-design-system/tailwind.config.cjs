/**
 * Tailwind config — 仅 Tailwind v3 用户需要.
 * Tailwind v4 用户直接用 src/styles/tailwind.css, 不用这个文件.
 *
 * 把所有颜色 token 注册为 utility:
 *   bg-bg-100 / text-text-200 / border-border-300 / 等
 */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx,html}", "./index.html"],
  theme: {
    extend: {
      colors: {
        // Backgrounds
        "bg-000": "hsl(var(--bg-000))",
        "bg-100": "hsl(var(--bg-100))",
        "bg-200": "hsl(var(--bg-200))",
        "bg-300": "hsl(var(--bg-300))",
        "bg-400": "hsl(var(--bg-400))",
        "bg-500": "hsl(var(--bg-500))",
        // Text
        "text-000": "hsl(var(--text-000))",
        "text-100": "hsl(var(--text-100))",
        "text-200": "hsl(var(--text-200))",
        "text-300": "hsl(var(--text-300))",
        "text-400": "hsl(var(--text-400))",
        "text-500": "hsl(var(--text-500))",
        // Brand (warm orange)
        "brand-000": "hsl(var(--brand-000))",
        "brand-100": "hsl(var(--brand-100))",
        "brand-200": "hsl(var(--brand-200))",
        "brand-900": "hsl(var(--brand-900))",
        // Accent (cool blue)
        "accent-000": "hsl(var(--accent-000))",
        "accent-100": "hsl(var(--accent-100))",
        "accent-200": "hsl(var(--accent-200))",
        "accent-900": "hsl(var(--accent-900))",
        // Accent-pro (purple)
        "accent-pro-000": "hsl(var(--accent-pro-000))",
        "accent-pro-100": "hsl(var(--accent-pro-100))",
        "accent-pro-200": "hsl(var(--accent-pro-200))",
        "accent-pro-900": "hsl(var(--accent-pro-900))",
        // Borders (alpha 已包好)
        "border-100": "hsl(var(--border-100) / 0.4)",
        "border-200": "hsl(var(--border-200) / 0.3)",
        "border-300": "hsl(var(--border-300) / 0.15)",
        "border-400": "hsl(var(--border-400) / 0.15)",
        // Danger / Success / Warning
        "danger-000": "hsl(var(--danger-000))",
        "danger-100": "hsl(var(--danger-100))",
        "danger-200": "hsl(var(--danger-200))",
        "danger-900": "hsl(var(--danger-900))",
        "success-000": "hsl(var(--success-000))",
        "success-100": "hsl(var(--success-100))",
        "success-200": "hsl(var(--success-200))",
        "success-900": "hsl(var(--success-900))",
        "warning-000": "hsl(var(--warning-000))",
        "warning-100": "hsl(var(--warning-100))",
        "warning-200": "hsl(var(--warning-200))",
        "warning-900": "hsl(var(--warning-900))",
        // Oncolor (反色文字)
        "oncolor-100": "hsl(var(--oncolor-100))",
        "oncolor-200": "hsl(var(--oncolor-200))",
        "oncolor-300": "hsl(var(--oncolor-300))",
        // Pictogram (icon 容器底色)
        "pictogram-100": "hsl(var(--pictogram-100))",
        "pictogram-200": "hsl(var(--pictogram-200))",
        "pictogram-300": "hsl(var(--pictogram-300))",
        "pictogram-400": "hsl(var(--pictogram-400))",
        // Always (不随主题切)
        "always-white": "hsl(var(--always-white))",
        "always-black": "hsl(var(--always-black))",
      },
      fontFamily: {
        sans:  ["Inter", "system-ui", "-apple-system", "sans-serif"],
        serif: ['"Source Serif 4"', "Georgia", "serif"],
        mono:  ['"JetBrains Mono"', "ui-monospace", "SF Mono", "monospace"],
      },
      borderRadius: {
        sm:  "0.25rem",
        md:  "0.375rem",
        lg:  "0.5rem",
        xl:  "0.75rem",
        "2xl": "1rem",
        "3xl": "1.5rem",
      },
    },
  },
  plugins: [],
};
