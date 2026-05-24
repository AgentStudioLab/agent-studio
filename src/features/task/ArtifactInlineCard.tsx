import {
  ChevronDown,
  FileSpreadsheet,
  FileText,
  Presentation,
  type LucideIcon,
} from "lucide-react";

export type ArtifactKind = "Spreadsheet" | "Presentation" | "Document";

const KIND_ICON: Record<ArtifactKind, LucideIcon> = {
  Spreadsheet: FileSpreadsheet,
  Presentation: Presentation,
  Document: FileText,
};

/**
 * Opener "brand chip" — small 14×14 letter square that mimics the host app
 * icon (W = Word/WPS Office, C = code editor). Matches prototype's
 * `openerLetter`/`openerColor` switch (HTML 2425-2427 for PreviewPane; line
 * 891-894 for ArtifactInlineCard which hardcodes W terracotta).
 *
 * Spreadsheet/Presentation → office suite ("W", brand orange).
 * Document (md/docx text)   → code editor ("C", accent blue).
 */
const KIND_OPENER: Record<ArtifactKind, { letter: string; bgVar: string }> = {
  Spreadsheet: { letter: "W", bgVar: "--brand-100" },
  Presentation: { letter: "W", bgVar: "--brand-100" },
  Document: { letter: "C", bgVar: "--accent-100" },
};

interface ArtifactInlineCardProps {
  title: string;
  kind: ArtifactKind;
  ext: string;
  opener: string;
  onOpen?: () => void;
}

/**
 * Inline artifact card (prototype Showcase 1 lines 882-896).
 * 48x48 file-type icon container + title/subtitle + opener button.
 */
export function ArtifactInlineCard({
  title,
  kind,
  ext,
  opener,
  onOpen,
}: ArtifactInlineCardProps) {
  const Icon = KIND_ICON[kind];
  const { letter, bgVar } = KIND_OPENER[kind];

  return (
    <div
      className="flex items-center gap-3 rounded-xl px-3 py-3"
      style={{
        background: "hsl(var(--bg-200) / 0.5)",
        border: "1px solid hsl(var(--border-300) / 0.12)",
      }}
    >
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md"
        style={{
          background: "hsl(var(--bg-300))",
          color: "hsl(var(--text-300))",
        }}
      >
        <Icon size={22} strokeWidth={1.5} />
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="truncate text-[14px] font-medium"
          style={{ color: "hsl(var(--text-100))" }}
        >
          {title}
        </div>
        <div
          className="mt-0.5 text-[12px]"
          style={{ color: "hsl(var(--text-400))" }}
        >
          {kind} · {ext}
        </div>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] transition-colors"
        style={{
          color: "hsl(var(--text-200))",
          border: "1px solid hsl(var(--border-300) / 0.18)",
        }}
      >
        <span
          className="flex h-3.5 w-3.5 items-center justify-center rounded-sm text-[9px] font-bold"
          style={{
            background: `hsl(var(${bgVar}))`,
            color: "hsl(var(--oncolor-100))",
          }}
        >
          {letter}
        </span>
        {opener}
        <ChevronDown size={11} />
      </button>
    </div>
  );
}
