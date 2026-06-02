// Leading YAML frontmatter handling for markdown previews.
//
// Streamdown has no frontmatter awareness: it reads the closing `---` as a
// setext-heading underline and renders the whole block as one giant heading.
// So we split the frontmatter off and render it ourselves as a tidy metadata
// panel (FrontmatterPanel), passing only the body to Streamdown.

export interface SplitMarkdown {
  /** Raw YAML between the `---` fences, or null when there's no frontmatter. */
  frontmatter: string | null;
  /** Everything after the closing fence (the whole input when no frontmatter). */
  body: string;
}

const LEADING_FRONTMATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/;

export function splitFrontmatter(markdown: string): SplitMarkdown {
  const m = markdown.match(LEADING_FRONTMATTER);
  if (!m) return { frontmatter: null, body: markdown };
  return { frontmatter: m[1] ?? "", body: markdown.slice(m[0].length) };
}

export interface FrontmatterEntry {
  /** "" for a bare value line (e.g. a list item) with no `key:`. */
  key: string;
  /** "" for a parent key (e.g. `metadata:`) that only nests children below. */
  value: string;
  /** Nesting level from indentation (2 spaces = 1 level). */
  depth: number;
}

function unquote(s: string): string {
  return s.replace(/^"([\s\S]*)"$/, "$1").replace(/^'([\s\S]*)'$/, "$1");
}

/** Minimal YAML reader for the shallow `key: value` (+ one nested map) shape our
 *  memory/skill frontmatter uses. Not a general YAML parser — unrecognized lines
 *  fall back to a bare value so nothing is dropped. */
export function parseFrontmatter(raw: string): FrontmatterEntry[] {
  const entries: FrontmatterEntry[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const depth = Math.floor((line.length - line.trimStart().length) / 2);
    const trimmed = line.trim();
    const colon = trimmed.indexOf(":");
    if (colon === -1) {
      entries.push({ key: "", value: unquote(trimmed), depth });
      continue;
    }
    entries.push({
      key: trimmed.slice(0, colon).trim(),
      value: unquote(trimmed.slice(colon + 1).trim()),
      depth,
    });
  }
  return entries;
}
