import { Fragment } from "react";
import { parseFrontmatter } from "./frontmatter";

/**
 * Renders a markdown file's YAML frontmatter as a compact metadata panel —
 * a 2-column key/value grid in a muted box — instead of the raw `--- … ---`
 * block (which Streamdown mis-renders as a giant heading). Nested keys (e.g.
 * under `metadata:`) indent; a parent key with no value reads as a sub-label.
 */
export function FrontmatterPanel({ raw }: { raw: string }) {
  const entries = parseFrontmatter(raw);
  if (entries.length === 0) return null;
  return (
    <div className="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md border border-border bg-muted/40 px-3 py-2.5 text-[12.5px] leading-relaxed">
      {entries.map((e, i) =>
        e.key && e.value ? (
          <Fragment key={i}>
            <span
              className="font-medium text-muted-foreground"
              style={{ paddingLeft: e.depth * 12 }}
            >
              {e.key}
            </span>
            <span className="break-all text-foreground">{e.value}</span>
          </Fragment>
        ) : (
          <span
            key={i}
            className="col-span-2 font-medium text-muted-foreground"
            style={{ paddingLeft: e.depth * 12 }}
          >
            {e.key || e.value}
          </span>
        ),
      )}
    </div>
  );
}
