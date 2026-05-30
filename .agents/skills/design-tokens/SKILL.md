---
name: design-tokens
description: Check Agent Studio's 3-tier design token system (primitives → semantic → components) BEFORE writing any component CSS, applying Tailwind classes for colors/spacing/radius, or hardcoding any style value. Use this whenever you are about to pick a color, spacing, radius, font, or shadow — even if you think you know the value. Use when adding new shadcn or ai-elements components (their token bridge may need new entries in shadcn-alias.css). Use when reviewing any PR that touches src/components/ or src/features/ styling. Always consult tokens FIRST, then decide whether to reuse, extend a tier, or in rare cases use a Tailwind one-off. Skipping this skill is the #1 source of theme drift and dark-mode breakage in this project.
---

# Design Tokens · Agent Studio

Agent Studio uses a 3-tier design token architecture under `src/styles/`. Touching styling without consulting it causes theme drift, dark-mode breakage, and "why does this look wrong" bugs. The chain is non-negotiable.

## The 3 tiers + bridge layers

```
primitives  (raw HSL / px values — Tailwind-style hue+step scale)
    ↓ var(--color-orange-500)
semantic    (UI-purpose aliases, mode-switched on data-mode)
    ↓ var(--bg-100), var(--brand-100), var(--text-100)
components  (component-local tokens — placeholder for now)
    ↓ var(--button-bg-default)
shadcn-alias (hsl()-wrapped semantic, so shadcn/ai-elements consume Anthropic colors)
    ↓ hsl(var(--brand-100))
@theme inline in src/index.css (Tailwind utility bridge)
    ↓ var(--primary)
Tailwind utility classes  bg-primary / text-foreground / border-border / rounded-card
```

**File map** (memorize):

| Tier | Path |
|---|---|
| primitives | `src/styles/primitives/{colors,spacing,radius,typography}.css` |
| semantic | `src/styles/semantic/{colors,spacing,radius}.css` |
| components | `src/styles/components/{button,input,card}.css` (skeletons, extend as needed) |
| shadcn-alias | `src/styles/shadcn-alias.css` |
| entry | `src/styles/globals.css` (@imports everything) |
| Tailwind bridge | `src/index.css` (`@theme inline` block) |

Theme dimension is **single-axis**: `data-mode="light|dark"` only. There is no `data-theme` attribute. Dark-mode overrides live in `:root[data-mode="dark"]` inside `semantic/colors.css`.

## Workflow before applying any style

### Step 1 · Try a Tailwind utility that already routes through tokens

Most component styling can reuse Tailwind classes that flow through our chain:

```tsx
<button className="bg-primary text-primary-foreground rounded-md px-4 py-2">
```

`bg-primary` resolves through `@theme inline` (`--color-primary: var(--primary)`) → `shadcn-alias.css` (`--primary: hsl(var(--brand-100))`) → `semantic/colors.css` (`--brand-100: var(--color-orange-600)` light / `--color-orange-500` dark) → `primitives/colors.css` (final HSL triple). One classname, three layers of indirection, dark-mode for free.

The shadcn-aliased names available as Tailwind utilities:

```
background, foreground, card, card-foreground, popover, popover-foreground,
primary, primary-foreground, secondary, secondary-foreground,
muted, muted-foreground, accent, accent-foreground, destructive,
border, input, ring,
sidebar, sidebar-foreground, sidebar-primary, sidebar-primary-foreground,
sidebar-accent, sidebar-accent-foreground, sidebar-border, sidebar-ring
```

If you can express the style with these classes — **use them and stop**. No token decision needed.

### Step 2 · Check semantic tokens if Tailwind doesn't expose what you need

Read `src/styles/semantic/colors.css`. The semantic palette covers:

- Surfaces: `--bg-000` (white) to `--bg-500` (deepest)
- Text: `--text-000` (strongest) to `--text-500` (weakest)
- Brand: `--brand-000/100/200/900`, `--accent-brand`
- Accent: `--accent-000/100/200/900`, `--accent-pro-000/100/200/900`
- Status: `--danger-*`, `--success-*`, `--warning-*` (each has 000/100/200/900)
- Border: `--border-100..--border-400` (apply alpha at point-of-use)
- On-color: `--oncolor-100/200/300` (text/icon on tinted surfaces)
- Pictogram: `--pictogram-100..--pictogram-400` (decorative surfaces)

Same for `semantic/spacing.css` (`--spacing-component-padding`, `--spacing-section-gap`, `--spacing-page-padding`, `--spacing-sidebar-width`, `--spacing-aside-width`) and `semantic/radius.css` (`--radius-button`, `--radius-input`, `--radius-chip`, `--radius-card`, `--radius-modal`, `--radius-thumbnail`, `--radius-pill`).

Consume them via `hsl(var(--xxx))` for colors or `var(--xxx)` for sizes:

```tsx
<aside style={{
  background: 'hsl(var(--bg-200))',
  padding: 'var(--spacing-component-padding)',
  borderRadius: 'var(--radius-card)'
}}>
```

Still prefer Tailwind class form when there's a mapped utility — easier to grep and discover.

### Step 3 · If nothing fits, decide whether to add a token

Ask **two questions**:

1. **Will this value be used in more than one place?**
2. **Does it represent a UI concept (a meaning), not a raw value (a hex)?**

| Answers | Action |
|---|---|
| Yes / Yes | Add to **semantic**; reference an existing primitive. If no primitive matches, add primitive too. |
| Yes / No | Add a **primitive** (new hue step or scale stop); also add a semantic alias even if it's 1:1 — semantic gives the value meaning. |
| No / Yes | Still consider semantic — single-use today, multi-use tomorrow. Cheap insurance. |
| No / No | Acceptable to use Tailwind primitive utility class (`bg-stone-100`, `rounded-md`) inline. Raw hex / HSL in JSX is still forbidden. |

### Special case · adding a new shadcn or ai-elements component

When you run `bunx shadcn@latest add <component>` or `bunx --bun ai-elements@latest add <component>`:

1. The new component file lands in `src/components/ui/` or `src/components/ai-elements/`
2. Read the component to find every shadcn token it references (e.g., `bg-card`, `text-chart-1`, `border-input`)
3. Cross-check each against `src/styles/shadcn-alias.css` — every token used MUST have a `--<name>: hsl(var(--<semantic>))` entry there. If missing, add it (and may need to add semantic + primitive first).
4. Without the alias entry, Tailwind utility will fall back to undefined / invisible, the component will appear broken in light or dark mode
5. After adding aliases, run `bun run build && bun run build-storybook` to verify the chain compiles

This is the most common cause of "the new component looks weird" — a token left dangling.

## Anti-patterns

❌ Raw color in JSX: `style={{ background: '#C66E51' }}`
❌ Raw HSL primitive in component: `style={{ color: 'hsl(15 54% 51%)' }}`
❌ Tailwind arbitrary value with raw color: `className="bg-[#C66E51]"`
❌ Skip semantic and reference primitive from components: `style={{ background: 'hsl(var(--color-orange-500))' }}` (use `--brand-100` or `--brand-200` instead)

> **Narrow exception — categorical palette pickers.** When the **primitive scale itself IS the UI concept** (a user-pickable hue palette, like `InitialsAvatar`'s 7-hue selector, or any future "tag color" picker), referencing primitives directly (`hsl(var(--color-orange-500))`, etc.) is allowed. The test: would minting a semantic alias add real meaning, or just rename the primitive 1:1? If the latter, stay on the primitive. This exception is narrow — default to semantic.
❌ Add a new token without first searching existing ones (`grep -rn "stone-50\|bg-100" src/styles/`)
❌ Adding a primitive without a semantic alias on top — primitives without semantic meaning don't survive a refactor
❌ Adding a semantic token without dark-mode override block — even if same value, force explicit thought

## Doing it right

✅ `<button className="bg-primary text-primary-foreground rounded-md">` (Tailwind → shadcn-alias → semantic)
✅ `<div style={{ color: 'hsl(var(--text-200))' }}>` (semantic, when Tailwind doesn't expose)
✅ For new shared concept: add primitive (if needed) + semantic + dark override + use semantic everywhere

## Decision flowchart

```
Need to apply a style value
        │
        ▼
Is there a Tailwind utility class that resolves
through our shadcn-alias names?
  ─ bg-primary / text-foreground / border-border / etc.
        │ no                                      │ yes
        ▼                                         └─→ use it. done.
Is there a semantic token (--bg-100, --brand-100,
 --spacing-section-gap, --radius-card) that matches?
        │ no                                      │ yes
        ▼                                         └─→ use `hsl(var(--xxx))`
                                                      or `var(--xxx)`. done.
Will value repeat OR represent a UI concept?
        │ no                       │ yes
        ▼                          ▼
Use Tailwind primitive       Add at the right tier(s)
utility (one-off, rare)      ── primitive ONLY if needed
                             ── semantic ALWAYS
                             ── dark-mode override in semantic
                             ── shadcn-alias ONLY if shadcn token
                             then use it. verify `bun run build`.
```

## When adding new tokens — checklist

- [ ] **Primitive** (if introducing a new HSL or scale step). Filename: `primitives/colors.css` (or `spacing.css` / `radius.css` / `typography.css`). Naming: Tailwind-style `--color-<hue>-<step>` (e.g., `--color-teal-500`).
- [ ] **Semantic** (always). Filename: `semantic/colors.css` (etc.). Reference primitive via `var(--color-*)`. Name by UI purpose (`--info-100`, `--bg-elevated`).
- [ ] **Dark-mode override** in `:root[data-mode="dark"]` block, even when identical — forces explicit thought.
- [ ] **shadcn-alias** entry only if a shadcn/ai-elements component expects this token name. Format: `--<shadcn-name>: hsl(var(--<semantic>))`.
- [ ] **Component layer** only if the token is component-local and won't propagate. Update `components/<name>.css`.
- [ ] **`bun run build && bun run build-storybook`** both pass.
- [ ] **`grep`** all usages of any prior hardcoded value you're replacing — clean them up in the same commit.

## When NOT to invoke this skill

- Pure layout: flex / grid / positioning / sizing arithmetic — Tailwind utilities work as-is, no token decisions
- Pure behavior: state, handlers, business logic, network calls
- Documentation / prose / comments without styling

## Reference: live token files (don't edit blindly)

```
src/styles/primitives/colors.css    # ~45 primitive HSL triples
src/styles/primitives/spacing.css   # --spacing: 0.25rem (Tailwind base unit)
src/styles/primitives/radius.css    # --radius-{none,xs,sm,md,lg,xl,2xl,3xl,full}
src/styles/primitives/typography.css # font families, size scale, weight scale
src/styles/semantic/colors.css      # ~50 semantic aliases + dark overrides
src/styles/semantic/spacing.css     # 7 named spacings
src/styles/semantic/radius.css      # 7 named radii
src/styles/components/{button,input,card}.css  # placeholders
src/styles/shadcn-alias.css         # ~26 shadcn token bridges
```

Read these in priority order during a styling decision — primitives last (you almost never need them directly).
