import yaml from "js-yaml";

/**
 * YAML frontmatter parser for markdown files (SKILL.md, CLAUDE.md, etc).
 *
 * Detects the standard "---" delimited block at the start of the file and
 * parses the body via js-yaml. Falls back gracefully:
 *   - no leading `---` block → `meta: null`, raw content as `body`
 *   - present but unparseable / non-object → same as no frontmatter, but the
 *     leading block is still stripped from `body` so the rendered preview
 *     doesn't dump the raw YAML in the user's face. (Mirrors the way the
 *     skill registry handles malformed frontmatter on the sidecar side.)
 */

const FRONTMATTER_RE = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/;

export interface ParsedMarkdown {
  meta: Record<string, unknown> | null;
  body: string;
}

export function parseFrontmatter(raw: string): ParsedMarkdown {
  const m = raw.match(FRONTMATTER_RE);
  if (!m) return { meta: null, body: raw };
  let meta: Record<string, unknown> | null = null;
  try {
    const out = yaml.load(m[1]!);
    if (typeof out === "object" && out !== null && !Array.isArray(out)) {
      meta = out as Record<string, unknown>;
    }
  } catch {
    meta = null;
  }
  return { meta, body: raw.slice(m[0].length) };
}

/** Read a string field from parsed frontmatter, trimmed. */
export function frontmatterString(
  meta: Record<string, unknown> | null,
  key: string,
): string | undefined {
  if (!meta) return undefined;
  const v = meta[key];
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
