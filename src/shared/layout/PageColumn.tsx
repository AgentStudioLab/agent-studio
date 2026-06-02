import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Centered, max-width content column for top-level list pages (Agents /
 * Tasks / Scheduled). Caps content width and centers it so the page never
 * hugs the window's left edge when the sidebar is collapsed — the side
 * margins grow symmetrically with available width.
 *
 * Owns centering + max-width ONLY. The caller's block keeps its own
 * horizontal padding (`px-12`, `px-9`, …) so each page's edge gap and text
 * alignment are preserved; this just caps + centers the inner content. At
 * typical sidebar-open widths the column fills the available space (no
 * visible change); the centering only takes effect once the pane grows wider
 * than the cap (wide window, or sidebar collapsed).
 */
export function PageColumn({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-[1080px]", className)}>
      {children}
    </div>
  );
}
