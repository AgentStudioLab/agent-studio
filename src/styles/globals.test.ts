import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

test("global styles give enabled button-like controls a hand cursor", async () => {
  const css = await readFile(join(import.meta.dir, "globals.css"), "utf8");

  expect(css).toContain(":where(");
  expect(css).toContain("button:not(:disabled)");
  expect(css).toContain('[role="button"]:not([aria-disabled="true"])');
  expect(css).toContain('[data-slot="button"]:not([aria-disabled="true"])');
  expect(css).toContain("cursor: pointer;");
});
