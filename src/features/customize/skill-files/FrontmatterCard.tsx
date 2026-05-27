import { Info } from "lucide-react";
import { useTranslation } from "react-i18next";

interface FrontmatterCardProps {
  description?: string;
}

/**
 * Renders the `description` field parsed out of a markdown file's YAML
 * frontmatter as a labeled paragraph above the rendered markdown body.
 * Hidden entirely when no description is present so plain .md files (no
 * frontmatter) don't grow a phantom header.
 *
 * Other frontmatter fields (`name`, `metadata.*`) are intentionally NOT
 * surfaced here — the markdown body typically restates the name in its
 * H1 already, and `metadata` is implementation-level info irrelevant to
 * the reader.
 */
export function FrontmatterCard({ description }: FrontmatterCardProps) {
  const { t } = useTranslation();
  if (!description) return null;
  return (
    <div className="px-4 pb-3 pt-4">
      <div
        className="mb-1 flex items-center gap-1 text-[12px]"
        style={{ color: "hsl(var(--text-400))" }}
      >
        <span>{t("customize.skills.files.description")}</span>
        <Info className="size-3" />
      </div>
      <div
        className="text-[14px] leading-[1.6]"
        style={{ color: "hsl(var(--text-100))" }}
      >
        {description}
      </div>
    </div>
  );
}
