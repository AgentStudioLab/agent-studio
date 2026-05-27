import { useTranslation } from "react-i18next";
import { CodeBlock } from "@/components/ai-elements/code-block";
import { MarkdownView } from "@/shared/markdown/MarkdownView";
import { languageFromPath } from "@/lib/code-lang";
import type { SkillFileContent } from "@/lib/agui/react/useSkillFiles";
import { fileExt, isHtml, isMarkdown } from "./ext";
import { frontmatterString, parseFrontmatter } from "./frontmatter";
import { FrontmatterCard } from "./FrontmatterCard";
import { HtmlRenderer } from "./HtmlRenderer";
import type { FilePreviewMode } from "./SkillFilePreviewHeader";

interface SkillFilePreviewBodyProps {
  /** Relative path (used for extension + language detection). */
  relPath: string;
  data: SkillFileContent;
  mode: FilePreviewMode;
}

/**
 * Dispatches a personal-skill file content to the right renderer:
 *   - .md / .markdown → MarkdownView (preview) or CodeBlock (source)
 *   - .html / .htm    → HtmlRenderer (iframe preview or CodeBlock source)
 *   - other text      → CodeBlock with shiki language inferred from extension
 *   - binary          → unsupported notice (Customize view doesn't open
 *                       binaries in external apps; user can find the file
 *                       on disk via the path in the skill card)
 */
export function SkillFilePreviewBody({
  relPath,
  data,
  mode,
}: SkillFilePreviewBodyProps) {
  const { t } = useTranslation();

  if (data.encoding === "base64") {
    return (
      <div className="px-4 py-6 text-sm text-muted-foreground">
        {t("task.preview.binaryNotice")}
      </div>
    );
  }

  const ext = fileExt(relPath);
  if (isMarkdown(ext)) {
    if (mode === "source") {
      return (
        <div className="p-1">
          <CodeBlock code={data.content} language="markdown" />
        </div>
      );
    }
    // Strip YAML frontmatter before rendering — agents author SKILL.md with a
    // `--- name/description ---` header that we want to surface as a labeled
    // Description block, not dump raw into the prose. Files without a
    // frontmatter block round-trip unchanged.
    const { meta, body } = parseFrontmatter(data.content);
    const description = frontmatterString(meta, "description");
    return (
      <>
        <FrontmatterCard description={description} />
        <MarkdownView
          content={body}
          className="prose-stream px-3 py-2 text-[14px] leading-[1.75]"
        />
      </>
    );
  }
  if (isHtml(ext)) {
    return <HtmlRenderer content={data.content} mode={mode} />;
  }
  return (
    <div className="p-1">
      <CodeBlock code={data.content} language={languageFromPath(relPath)} />
    </div>
  );
}
