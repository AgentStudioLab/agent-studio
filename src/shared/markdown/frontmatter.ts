// Strip a leading YAML frontmatter block (--- … ---) from markdown before
// rendering. Standard renderers (GitHub etc.) hide frontmatter; without this,
// Streamdown reads the closing `---` as a setext-heading underline and renders
// the whole block as one giant bold heading. Raw/source views keep it.
const LEADING_FRONTMATTER = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/;

export function stripFrontmatter(markdown: string): string {
  return markdown.replace(LEADING_FRONTMATTER, "");
}
