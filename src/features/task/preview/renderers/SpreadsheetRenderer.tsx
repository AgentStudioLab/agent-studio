// Spreadsheet renderer — current implementation: render comma-separated
// rows as a borderless table. Used for .csv files coming back as utf8.
//
// Future: when xlsx support lands, this renderer will branch on file.path
// extension and either keep the CSV path or fetch a parsed-sheet endpoint
// from the sidecar (rows + column types) and render the same table with
// better cell-type formatting (numbers right-aligned, dates iso, etc).

import type { PreviewRendererProps } from "./types";

export function SpreadsheetRenderer({ data }: PreviewRendererProps) {
  const rows = data.content
    .split(/\r?\n/)
    .filter((r) => r.trim().length > 0)
    .map((row) => row.split(","));
  const [header, ...body] = rows;
  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {header?.map((h, i) => (
              <th
                key={`h-${i}`}
                className="border-border border-b px-3 py-2 text-left font-medium text-foreground"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, i) => (
            <tr key={`r-${i}`} className="hover:bg-muted/50">
              {row.map((cell, j) => (
                <td
                  key={`r-${i}-c-${j}`}
                  className="border-border border-b px-3 py-2 text-foreground"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
