import { describe, expect, it } from "bun:test";
import { readdir, readFile } from "node:fs/promises";

const sourceRoots = [
  new URL("../features/", import.meta.url),
  new URL("./", import.meta.url),
];

const ignoredSuffixes = [".test.tsx", ".stories.tsx"];

async function collectTsxFiles(root: URL): Promise<URL[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, root);
      if (entry.isDirectory()) {
        return collectTsxFiles(child);
      }
      if (!entry.name.endsWith(".tsx")) return [];
      if (ignoredSuffixes.some((suffix) => entry.name.endsWith(suffix))) return [];
      return [child];
    }),
  );
  return files.flat();
}

describe("theme primary actions", () => {
  it("does not use neutral inverse colors for branded action buttons", async () => {
    const files = (await Promise.all(sourceRoots.map(collectTsxFiles))).flat();
    const violations: string[] = [];
    const forbiddenPairs = [
      {
        name: "bg-foreground/text-background",
        pattern: /(?:bg-foreground[\s\S]{0,160}text-background|text-background[\s\S]{0,160}bg-foreground)/,
      },
      {
        name: "bg-text-100/text-bg-100",
        pattern: /(?:bg-text-100[\s\S]{0,160}text-bg-100|text-bg-100[\s\S]{0,160}bg-text-100)/,
      },
      {
        name: "accent-100/oncolor-100",
        pattern: /bg-\[hsl\(var\(--accent-100\)\)\][\s\S]{0,160}text-\[hsl\(var\(--oncolor-100\)\)\]/,
      },
    ];

    for (const file of files) {
      const source = await readFile(file, "utf8");
      for (const { name, pattern } of forbiddenPairs) {
        if (pattern.test(source)) {
          violations.push(`${file.pathname}: ${name}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
