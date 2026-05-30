---
name: theme-creator
description: Create and register a new brand theme on Agent Studio's `data-brand` color axis — which color values you must supply, how to add a missing primitive hue, the white-text contrast rules, the optional font-family swap, and how to register the theme so it appears in the system. Use this WHENEVER the user wants to add a theme, a brand/primary/accent color, a "主题色"/"品牌色"/配色, a color scheme or skin, asks "how do I make the app blue/green/purple", or wants to define/register something under `src/styles/themes/` — even if they never say the word "theme". Do NOT use it for one-off component styling (use the `design-tokens` skill) or for light/dark mode, which is the separate `data-mode` axis.
---

# Theme Creator · Agent Studio

Brand themes live on the **`data-brand`** axis (a sibling of the `data-mode` light/dark axis). A theme is a small CSS file that remaps the brand + accent color tokens, plus one entry in a TS registry. The 3-tier token system (see the `design-tokens` skill) was built for exactly this: because the whole UI routes color through `--brand-*` / `--accent-*`, a theme only has to redefine those — no component touches needed.

This skill tells you precisely what to supply and how to wire it. Keep the surface small on purpose — over-specifying (per-theme radius/spacing/type) is how token systems rot into unmaintainable catalogs.

## What a theme controls — and what it must NOT

A theme changes **brand identity** (color, optionally the typeface). It does **not** change **ergonomics**:

| Theme MAY set | Theme must NOT set | Why |
|---|---|---|
| `--brand-*`, `--accent-*` (required) | `--radius-*` (圆角) | Radius is a *personality* axis (sharp/round), orthogonal to color. Same product, different tint → radius shouldn't move. |
| `--font-family-*` (optional) | `--spacing-*` (间距) | Spacing is a *density* axis (comfortable/compact), orthogonal to color. |
| | font size / weight / leading scale | That scale is the product's shared rhythm; forking it per-theme reproduces the marketing-catalog mess. |

If the user genuinely wants density or shape variants, that is a **separate future axis** (`data-density`, `data-shape`) — not this skill. Don't smuggle radius/spacing into a brand theme; it explodes the authoring burden and lets a theme break layout and accessibility.

## The color tokens you must define (light + dark)

A theme defines these 9 semantic tokens. Only a few are heavily used today, but define all 9 — they're exposed as Tailwind color utilities (`bg-brand-100`, etc.) and keep the cluster whole.

| Token | Drives | Priority |
|---|---|---|
| `--brand-100` | `--primary`, `--ring`, `--sidebar-primary/ring`, `--state-selected` (the "selected" highlight across sidebar / settings / lists) + the main brand color across the UI | ★★★ |
| `--brand-200` | primary-button hover (`--button-bg-hover`) | ★★ |
| `--brand-000` | reserve (stronger brand); `bg-brand-000` | ★ |
| `--brand-900` | reserve (deepest; terracotta = pure black) | ☆ |
| `--accent-brand` | reserve | ☆ |
| `--accent-100` | `--accent` + `:focus-visible` outline color | ★★★ |
| `--accent-200` | `bg-accent-200` | ★ |
| `--accent-000` | reserve (stronger accent) | ☆ |
| `--accent-900` | reserve (faint tinted backgrounds) | ☆ |

**Selected / highlight states come for free — they ride on `--brand-100`.** The app-wide "selected" highlight (`--state-selected`: the active sidebar item, the settings-nav row, list selections in Tasks / Customize / Runs, **and** the highlighted item in shadcn dropdowns / menus / selects — shadcn's `--accent` aliases to `--state-selected`) is defined in `semantic/colors.css` as a low-alpha tint of `--brand-100` (`hsl(var(--brand-100) / 0.16)` light, `/ 0.3` dark), so it tracks your theme automatically — you don't define it. The implication: `--brand-100`'s hue colors the whole "you are here" affordance, not just buttons — pick it with that in mind. Hover (`--state-hover`) deliberately stays a neutral gray overlay (transient, not themed).

## Rules

1. **Selectors are fixed.** Light → `:root[data-brand="<id>"]`; dark → `:root[data-brand="<id>"][data-mode="dark"]`. The dark block (specificity 0,3,0) always wins over the light block (0,2,0), so dark resolves correctly and themes never leak into one another.
2. **Light block defines all 9; the dark block lists only the tokens whose value differs in dark.** Anything the dark block omits inherits the light value — that's intentional, it keeps dark blocks small.
3. **Reference primitives only — never raw HSL.** Values are `var(--color-<hue>-<step>)`. Note: `themes/*.css` *is* the semantic layer (it assigns the semantic brand/accent tokens), so referencing primitives here is correct — the rule against touching primitives applies to components/features, not to this layer. If your hue isn't in `primitives/colors.css`, add the scale steps first (Tailwind naming `--color-<hue>-<step>`, bare HSL triple `H S% L%`, 50 lightest → 950 darkest). When adding primitives, follow the `design-tokens` skill.
4. **Contrast is non-negotiable.** Both `--brand-100` and `--accent-100` carry **white** text (`--primary-foreground` / `--accent-foreground` = `--oncolor-100` = white). They must pass WCAG AA (4.5:1 body, 3:1 large/UI). Heuristic: for a saturated hue keep lightness **L ≤ ~55%** in light mode, ~60% in dark. Picking a pale hue (yellow, mint) makes white text fail — deepen it or that hue isn't viable as a brand. Verify the actual pair, don't eyeball.
5. **Dark is usually one step lighter than light.** A saturated brand reads better when brightened against a dark canvas. Terracotta: light `--brand-100 = orange-600` (deeper) → dark `orange-500` (brighter); accent light `blue-600` → dark `accent-000 = blue-400`.

## Optional: swap the typeface

A theme MAY change the font **family** (and only the family). Set `--font-family-sans` / `--font-family-serif` / `--font-family-mono` inside the theme's `[data-brand]` block — they propagate to `<body>` and every Tailwind `font-sans/serif/mono` utility via `@theme inline` in `src/index.css`.

Do this deliberately — fonts are heavier than colors:

- **Load the font.** It's a network asset: add it to `index.html` (the Google-Fonts `<link>` or a self-hosted face) + `preconnect`. Colors are free; fonts are not. Mind licensing (e.g. SF Pro is Apple-only).
- **Do NOT override the size/weight/leading scale** in `typography.css`. Only the family.
- **Re-check weights.** The weight scale (`430 / 550 / 580`) and the dark-mode weight balancing in `globals.css` (`510 / 540 / 530`) are tuned for Inter. A different family may render them differently — adjust if it looks off.
- Record a label in the registry: `font: "SF Pro"`.

## Template

`src/styles/themes/<id>.css` — copy this and swap `<id>` / `<hue>` / `<hue2>`:

```css
/* Theme · <Display Name> */
:root[data-brand="<id>"] {
  /* Brand */
  --brand-000: var(--color-<hue>-600);
  --brand-100: var(--color-<hue>-600);   /* ★ white text sits here — verify contrast */
  --brand-200: var(--color-<hue>-500);   /* primary-button hover */
  --brand-900: var(--color-pure-black);
  --accent-brand: var(--color-<hue>-500);
  /* Accent */
  --accent-000: var(--color-<hue2>-700);
  --accent-100: var(--color-<hue2>-600); /* ★ white text + focus ring — verify contrast */
  --accent-200: var(--color-<hue2>-600);
  --accent-900: var(--color-<hue2>-100);
  /* Optional font (only if this theme swaps the typeface — and load it in index.html):
  --font-family-sans: "<Family>", system-ui, sans-serif; */
}
:root[data-brand="<id>"][data-mode="dark"] {
  /* only what differs from light */
  --brand-000: var(--color-<hue>-600);
  --brand-100: var(--color-<hue>-500);
  --brand-200: var(--color-<hue>-500);
  --accent-000: var(--color-<hue2>-400);
  --accent-900: var(--color-<hue2>-900);
}
```

Registry entry — `src/styles/themes/registry.ts`:

```ts
registerTheme({
  id: "<id>",                                  // = data-brand value; unique; never translated
  nameKey: "settings.appearance.brands.<id>",  // i18n key (add the string in en/zh below)
  swatch: { brand: "--color-<hue>-600", accent: "--color-<hue2>-600" }, // picker chip (primitive names)
  order: 1,                                     // sort order; default theme is 0
  // font: "<Family>",                          // only if the theme swaps the typeface
});
```

## Steps

1. **If the hue is missing**, add its scale to `src/styles/primitives/colors.css` (brand needs ~2 steps: a ~600 for light + a ~500 for dark; accent needs ~5 steps mirroring blue's `100/400/600/700/900`). Follow the `design-tokens` skill.
2. **Write** `src/styles/themes/<id>.css` from the template, then add `@import "./<id>.css";` to `src/styles/themes/index.css`.
3. **Register**: call `registerTheme({...})` in `src/styles/themes/registry.ts`, and add the display name to `src/i18n/locales/en/settings.json` and `.../zh/settings.json` under `appearance.brands.<id>`.
4. **(Optional font)** load the font in `index.html`, set `--font-family-*` in the theme CSS, and set `font:` in the registry entry.
5. **Verify** (below).

## Verify

- `bun test src/styles/themes/registry.test.ts` — registry still consistent.
- `bunx tsc --noEmit -p tsconfig.app.json` — clean (ignore pre-existing `.stories.tsx` errors).
- `bunx vite build` — the `@import` chain resolves.
- **Contrast**: confirm white-on-`brand-100` and white-on-`accent-100` pass WCAG AA, in both modes.
- **Preview**: run `bun run dev`, open **Settings → Appearance → Theme color**, and pick the new theme (the `BrandSegment` picker lists every registered theme). Toggle light/dark to check both modes. The default theme's id must stay equal to the static `data-brand` in `index.html` (currently `terracotta`).

## Files

```
src/styles/themes/registry.ts     ThemeMeta + registerTheme()/listThemes()/getTheme()/defaultThemeId()
src/styles/themes/<id>.css        the theme's token block (this skill's main output)
src/styles/themes/index.css       @import list
src/styles/primitives/colors.css  add a hue here if missing
src/i18n/locales/{en,zh}/settings.json   appearance.brands.<id> display name
index.html                        <html data-brand="..."> (static default; font <link> if needed)
```
