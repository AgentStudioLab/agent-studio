/**
 * Theme registry — brand-color themes (the `data-brand` axis).
 * --------------------------------------------------------------
 * TS is the single source of truth for *which* themes exist (meta drives the
 * settings picker + validation); the actual token values live in the sibling
 * `<id>.css` files, scoped to `:root[data-brand="<id>"]`.
 *
 * To add a theme:
 *   1. write `themes/<id>.css` and @import it in `themes/index.css`
 *   2. call `registerTheme({ ... })` (built-ins below; external code may too)
 *
 * The default theme's id MUST match the static `data-brand` on <html> in
 * index.html (and, later, the value theme-init.js writes from storage).
 */

export interface ThemeMeta {
  /** Stable id — the `data-brand` value and (future) storage key. Never translated. */
  id: string;
  /** i18n key for the display name, e.g. "settings.appearance.brands.terracotta". */
  nameKey: string;
  /**
   * Representative swatch for the picker chip. Primitive var names (not
   * semantic) so the chip shows THIS theme's color regardless of the active
   * theme — the documented "categorical palette picker" token exception.
   */
  swatch: { brand: string; accent: string };
  /**
   * Optional typeface label for the picker (e.g. "SF Pro"). Set this ONLY when
   * the theme's CSS also overrides `--font-family-*` under its `[data-brand]`
   * selector. The actual font stacks live in the CSS (single source of truth);
   * this is metadata for the UI. A theme may swap the font *family* only — never
   * the size/weight/leading scale, which stays global. Omit to keep the default
   * (Inter / Source Serif 4). Note: fonts are network assets — a non-default
   * font must also be loaded (index.html), unlike colors which are free.
   */
  font?: string;
  /** Sort order in the picker. */
  order: number;
  /** The default theme — its id must equal the static data-brand in index.html. */
  isDefault?: boolean;
}

const registry = new Map<string, ThemeMeta>();

/** Register a brand theme. Built-ins call this at module load; external code may too. */
export function registerTheme(meta: ThemeMeta): void {
  registry.set(meta.id, meta);
}

/** All registered themes, sorted by `order`. */
export function listThemes(): ThemeMeta[] {
  return [...registry.values()].sort((a, b) => a.order - b.order);
}

export function getTheme(id: string): ThemeMeta | undefined {
  return registry.get(id);
}

/** The default theme's id (falls back to "terracotta" if none is flagged). */
export function defaultThemeId(): string {
  for (const m of registry.values()) if (m.isDefault) return m.id;
  return "terracotta";
}

// ---- Built-in themes ----

registerTheme({
  id: "terracotta",
  nameKey: "settings.appearance.brands.terracotta",
  swatch: { brand: "--color-orange-600", accent: "--color-blue-600" },
  order: 0,
  isDefault: true,
});
