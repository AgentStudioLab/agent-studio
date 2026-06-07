import { afterEach, describe, expect, it, mock } from "bun:test";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

mock.module("@streamdown/mermaid", () => ({
  mermaid: {
    getMermaid: () => ({
      render: async (_id: string, source: string) => ({
        svg: `<svg role="img" data-testid="mock-mermaid-svg"><text>${source}</text></svg>`,
      }),
    }),
  },
}));

const { Streamdown } = await import("streamdown");
const { STREAMDOWN_COMPONENTS } = await import("./MarkdownCodeBlock");
const { MarkdownMermaidBlock } = await import("./MarkdownMermaidBlock");
const { STREAMDOWN_PLUGINS } = await import("./streamdownPlugins");

afterEach(() => cleanup());

describe("MarkdownMermaidBlock", () => {
  it("renders diagram view by default", async () => {
    render(
      <MarkdownMermaidBlock
        code={"flowchart LR\n  A --> B"}
        isIncomplete={false}
        language="mermaid"
      />
    );

    expect(screen.getByRole("button", { name: "图表" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "源码" }).getAttribute("aria-pressed")).toBe("false");
    await waitFor(() => expect(screen.getByTestId("mock-mermaid-svg")).toBeDefined());
  });

  it("switches to source view and shows the original Mermaid code", async () => {
    render(
      <MarkdownMermaidBlock
        code={"sequenceDiagram\n  Alice->>Bob: Hi"}
        isIncomplete={false}
        language="mermaid"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "源码" }));

    expect(screen.getByRole("button", { name: "源码" }).getAttribute("aria-pressed")).toBe("true");
    expect(document.body.textContent).toContain("sequenceDiagram");
    expect(document.body.textContent).toContain("Alice->>Bob: Hi");
  });

  it("does not render a diagram while the Mermaid fence is incomplete", () => {
    render(
      <MarkdownMermaidBlock
        code={"flowchart LR\n  A -->"}
        isIncomplete
        language="mermaid"
      />
    );

    expect(screen.queryByTestId("mock-mermaid-svg")).toBeNull();
    expect(screen.getByText("Mermaid 正在生成，源码可先查看。")).toBeDefined();
  });

  it("routes Mermaid fences through the shared Streamdown renderer", async () => {
    render(
      <Streamdown
        components={STREAMDOWN_COMPONENTS}
        plugins={STREAMDOWN_PLUGINS}
      >
        {"```mermaid\nflowchart LR\n  A --> B\n```"}
      </Streamdown>
    );

    expect(screen.getByRole("button", { name: "图表" })).toBeDefined();
    await waitFor(() => expect(screen.getByTestId("mock-mermaid-svg")).toBeDefined());
  });

  it("keeps non-Mermaid code fences on the normal code block renderer", () => {
    render(
      <Streamdown
        components={STREAMDOWN_COMPONENTS}
        plugins={STREAMDOWN_PLUGINS}
      >
        {"```typescript\nconst ok = true;\n```"}
      </Streamdown>
    );

    expect(screen.queryByRole("button", { name: "图表" })).toBeNull();
    expect(screen.getByText("typescript")).toBeDefined();
    expect(document.body.textContent).toContain("const ok = true;");
  });
});
