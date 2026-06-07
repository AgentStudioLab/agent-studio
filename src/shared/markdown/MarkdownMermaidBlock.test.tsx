import { afterEach, describe, expect, it, mock } from "bun:test";
import type { ReactNode } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

const mermaidRenderCalls: string[] = [];
let mermaidSvgFactory = (source: string) =>
  `<svg role="img" data-testid="mock-mermaid-svg"><text>${source}</text></svg>`;

mock.module("@streamdown/mermaid", () => ({
  createMermaidPlugin: () => ({
    language: "mermaid",
    name: "mermaid",
    type: "diagram",
    getMermaid: () => ({
      render: async (_id: string, source: string) => {
        mermaidRenderCalls.push(source);
        return {
          svg: mermaidSvgFactory(source),
        };
      },
    }),
  }),
  mermaid: {
    getMermaid: () => ({
      render: async (_id: string, source: string) => {
        mermaidRenderCalls.push(source);
        return {
          svg: mermaidSvgFactory(source),
        };
      },
    }),
  },
}));

mock.module("@/components/ui/dialog", () => ({
  Dialog: ({
    open,
    children,
  }: {
    open: boolean;
    onOpenChange?: (open: boolean) => void;
    children: ReactNode;
  }) => (open ? <>{children}</> : null),
  DialogContent: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => (
    <div role="dialog" className={className}>
      {children}
    </div>
  ),
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

const { Streamdown } = await import("streamdown");
const { STREAMDOWN_COMPONENTS } = await import("./MarkdownCodeBlock");
const { MarkdownMermaidBlock } = await import("./MarkdownMermaidBlock");
const { STREAMDOWN_MARKDOWN_COMPONENTS, STREAMDOWN_PLUGINS } = await import("./streamdownPlugins");

afterEach(() => {
  mermaidRenderCalls.length = 0;
  mermaidSvgFactory = (source: string) =>
    `<svg role="img" data-testid="mock-mermaid-svg"><text>${source}</text></svg>`;
  cleanup();
});

function installPngDownloadMocks() {
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  const originalCreateElement = document.createElement.bind(document);
  const originalImage = window.Image;
  const anchorPrototype = window.HTMLAnchorElement.prototype;
  const originalClick = anchorPrototype.click;

  const createdBlobs: Blob[] = [];
  const clickedDownloads: string[] = [];
  const canvasFillStyles: string[] = [];
  const imageSources: string[] = [];
  const revokedUrls: string[] = [];

  URL.createObjectURL = ((blob: Blob) => {
    createdBlobs.push(blob);
    return `blob:mermaid-${createdBlobs.length}`;
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = ((url: string) => {
    revokedUrls.push(url);
  }) as typeof URL.revokeObjectURL;

  document.createElement = ((tagName: string, options?: ElementCreationOptions) => {
    const element = originalCreateElement(tagName, options);

    if (tagName.toLowerCase() === "canvas") {
      const canvas = element as HTMLCanvasElement;
      canvas.getContext = (() => ({
        drawImage: () => undefined,
        fillRect: () => undefined,
        set fillStyle(value: string) {
          canvasFillStyles.push(value);
        },
      })) as typeof canvas.getContext;
      canvas.toBlob = ((callback: BlobCallback, type?: string | null) => {
        callback(new Blob(["png"], { type: type ?? "image/png" }));
      }) as typeof canvas.toBlob;
    }

    return element;
  }) as typeof document.createElement;

  class MockImage {
    onload: (() => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    private currentSrc = "";

    get src() {
      return this.currentSrc;
    }

    set src(nextSrc: string) {
      this.currentSrc = nextSrc;
      imageSources.push(nextSrc);
      queueMicrotask(() => this.onload?.());
    }
  }

  window.Image = MockImage as unknown as typeof window.Image;
  anchorPrototype.click = function click() {
    clickedDownloads.push(this.download);
  };

  return {
    clickedDownloads,
    canvasFillStyles,
    createdBlobs,
    imageSources,
    restoredUrls: revokedUrls,
    restore: () => {
      URL.createObjectURL = originalCreateObjectUrl;
      URL.revokeObjectURL = originalRevokeObjectUrl;
      document.createElement = originalCreateElement;
      window.Image = originalImage;
      anchorPrototype.click = originalClick;
    },
  };
}

describe("MarkdownMermaidBlock", () => {
  it("exports composed markdown components without mutating the base code components", () => {
    expect(STREAMDOWN_MARKDOWN_COMPONENTS).toBeDefined();
    expect(STREAMDOWN_MARKDOWN_COMPONENTS).not.toBe(STREAMDOWN_COMPONENTS);
    expect(STREAMDOWN_MARKDOWN_COMPONENTS.pre).not.toBe(STREAMDOWN_COMPONENTS.pre);
  });

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

  it("copies source from the top controls in source view", async () => {
    const originalClipboard = navigator.clipboard;
    const copiedTexts: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          copiedTexts.push(text);
        },
      },
    });

    try {
      const code = "sequenceDiagram\n  Alice->>Bob: Hi";
      render(
        <MarkdownMermaidBlock
          code={code}
          isIncomplete={false}
          language="mermaid"
        />
      );

      fireEvent.click(screen.getByRole("button", { name: "源码" }));
      const copyButton = screen.getByRole("button", { name: "复制源码" });
      fireEvent.click(copyButton);

      await waitFor(() => expect(copiedTexts).toEqual([code]));
      expect(screen.getAllByRole("button")).toHaveLength(3);
    } finally {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: originalClipboard,
      });
    }
  });

  it("opens the rendered diagram in a larger viewer", async () => {
    render(
      <MarkdownMermaidBlock
        code={"flowchart LR\n  A --> B"}
        isIncomplete={false}
        language="mermaid"
      />
    );

    await waitFor(() => expect(screen.getByTestId("mock-mermaid-svg")).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "放大查看图表" }));

    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByRole("heading", { name: "Mermaid 图表" })).toBeDefined();
    expect(screen.getByTestId("mermaid-diagram-viewer")).toBeDefined();
  });

  it("downloads the rendered diagram as a PNG file", async () => {
    const downloadMocks = installPngDownloadMocks();
    const originalBodyBackground = document.body.style.backgroundColor;
    document.body.style.backgroundColor = "rgb(248, 248, 248)";

    try {
      const view = render(
        <MarkdownMermaidBlock
          code={"flowchart LR\n  A --> B"}
          isIncomplete={false}
          language="mermaid"
        />
      );

      await waitFor(() => expect(screen.getByTestId("mock-mermaid-svg")).toBeDefined());
      await waitFor(() =>
        expect(downloadMocks.createdBlobs.map((blob) => blob.type)).toEqual([
          "image/svg+xml;charset=utf-8",
          "image/png",
        ])
      );
      const blobCountBeforeClick = downloadMocks.createdBlobs.length;

      fireEvent.click(screen.getByRole("button", { name: "下载图表" }));

      await waitFor(() =>
        expect(downloadMocks.clickedDownloads).toEqual(["mermaid-diagram.png"])
      );
      expect(downloadMocks.createdBlobs).toHaveLength(blobCountBeforeClick);
      expect(downloadMocks.canvasFillStyles).toEqual([
        window.getComputedStyle(document.body).backgroundColor,
      ]);
      expect(downloadMocks.restoredUrls).toEqual(["blob:mermaid-1"]);
      view.unmount();
      expect(downloadMocks.restoredUrls).toEqual([
        "blob:mermaid-1",
        "blob:mermaid-2",
      ]);
    } finally {
      document.body.style.backgroundColor = originalBodyBackground;
      downloadMocks.restore();
    }
  });

  it("rasterizes XML-safe SVG when Mermaid renders HTML-style void tags", async () => {
    mermaidSvgFactory = () =>
      `<svg xmlns="http://www.w3.org/2000/svg" role="img" data-testid="mock-mermaid-svg"><foreignObject><p>Line<br></p></foreignObject></svg>`;
    const downloadMocks = installPngDownloadMocks();

    try {
      render(
        <MarkdownMermaidBlock
          code={"flowchart LR\n  A --> B"}
          isIncomplete={false}
          language="mermaid"
        />
      );

      await waitFor(() => expect(screen.getByTestId("mock-mermaid-svg")).toBeDefined());
      await waitFor(() => expect(downloadMocks.createdBlobs[1]?.type).toBe("image/png"));
      fireEvent.click(screen.getByRole("button", { name: "下载图表" }));

      await waitFor(() =>
        expect(downloadMocks.clickedDownloads).toEqual(["mermaid-diagram.png"])
      );
      const downloadedSvg = await downloadMocks.createdBlobs[0].text();
      const parsed = new window.DOMParser().parseFromString(
        downloadedSvg,
        "image/svg+xml"
      );

      expect(downloadedSvg).toContain("<br/>");
      expect(parsed.querySelector("parsererror")).toBeNull();
      expect(downloadMocks.createdBlobs[1].type).toBe("image/png");
    } finally {
      downloadMocks.restore();
    }
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
        components={STREAMDOWN_MARKDOWN_COMPONENTS}
        plugins={STREAMDOWN_PLUGINS}
      >
        {"```mermaid\nflowchart LR\n  A --> B\n```"}
      </Streamdown>
    );

    expect(screen.getByRole("button", { name: "图表" })).toBeDefined();
    await waitFor(() => expect(screen.getByTestId("mock-mermaid-svg")).toBeDefined());
  });

  it("does not render an incomplete streaming Mermaid fence through Streamdown", () => {
    render(
      <Streamdown
        mode="streaming"
        parseIncompleteMarkdown
        isAnimating
        components={STREAMDOWN_MARKDOWN_COMPONENTS}
        plugins={STREAMDOWN_PLUGINS}
      >
        {"```mermaid\nflowchart LR\n  A -->"}
      </Streamdown>
    );

    expect(mermaidRenderCalls).toHaveLength(0);
    expect(screen.getByText("Mermaid 正在生成，源码可先查看。")).toBeDefined();
  });

  it("keeps non-Mermaid code fences on the normal code block renderer", () => {
    render(
      <Streamdown
        components={STREAMDOWN_MARKDOWN_COMPONENTS}
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
