import { useTranslation } from "react-i18next";
import { AppShell } from "@/app/AppShell";
import { SkillsBody } from "@/features/customize/SkillsBody";

/**
 * Skills as a top-level sidebar destination — a peer of Projects / Scheduled.
 * Reuses Customize's `SkillsBody` (the self-contained 2-pane skill list +
 * detail / file-preview, data via `useSkills`), rendered in-pane with the
 * sidebar visible.
 *
 * The header mirrors the airy serif page title + subtitle of the Scheduled
 * list so the top-level views read consistently. Its `pt-12` drops the title
 * below the 36px MacTitlebar overlay strip — the same trick ScheduledListView
 * uses — so the collapsed-sidebar toggle (which lives in that strip) never
 * overlaps it, and no per-collapse padding is needed.
 */
export function SkillsView() {
  const { t } = useTranslation();
  return (
    <AppShell
      main={
        <>
          <header data-tauri-drag-region className="shrink-0 px-12 pb-4 pt-12">
            <h1 className="font-serif text-[32px] font-normal leading-none text-foreground">
              {t("skills.title")}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              {t("skills.subtitle")}
            </p>
          </header>
          {/* Align the 2-pane content's text with the header's px-12 (48px)
              margin. SkillsBody's panes carry their own asymmetric insets
              (list aside px-3 → 12px, detail px-8 → 32px), so we compensate on
              the wrapper rather than editing the shared body: 28+12+8 = 48 on
              the left (list label / card), 16+32 = 48 on the right (detail). */}
          <div className="flex min-h-0 flex-1 pl-7 pr-4">
            <SkillsBody />
          </div>
        </>
      }
    />
  );
}
