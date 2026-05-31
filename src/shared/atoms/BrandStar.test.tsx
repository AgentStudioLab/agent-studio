import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "bun:test";
import { BrandStar } from "@/shared/atoms/BrandStar";

afterEach(() => {
  cleanup();
});

describe("BrandStar", () => {
  it("uses theme tokens for the logo background gradient", () => {
    const { container } = render(<BrandStar />);

    const stops = Array.from(container.querySelectorAll("linearGradient stop")).map((stop) =>
      stop.getAttribute("stop-color"),
    );

    expect(stops).toEqual(["hsl(var(--brand-100))", "hsl(var(--accent-100))"]);
  });

  it("does not fill outlined logo strokes with the default black fill", () => {
    const { container } = render(<BrandStar />);

    const outlinedPaths = Array.from(container.querySelectorAll("path[stroke]"));

    expect(outlinedPaths.length).toBeGreaterThan(0);
    expect(outlinedPaths.every((path) => path.getAttribute("fill") === "none")).toBe(true);
  });
});
