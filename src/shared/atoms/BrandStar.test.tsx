import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "bun:test";
import { BrandStar } from "@/shared/atoms/BrandStar";

afterEach(() => {
  cleanup();
});

describe("BrandStar", () => {
  it("renders the shared logo PNG asset", () => {
    const { container } = render(<BrandStar />);

    const image = container.querySelector("img");

    expect(image?.getAttribute("src")).toBe("/logo/logo.png");
    expect(image?.getAttribute("alt")).toBe("Agent Studio brand mark");
  });

  it("keeps explicit dimensions and supports the spinning state", () => {
    const { container } = render(<BrandStar />);

    const image = container.querySelector("img");

    expect(image?.getAttribute("width")).toBe("16");
    expect(image?.getAttribute("height")).toBe("16");

    const { container: spinningContainer } = render(<BrandStar spinning />);
    expect(spinningContainer.querySelector("img")?.className).toContain("animate-spin-slow");
  });
});
