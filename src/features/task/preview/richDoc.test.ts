import { describe, expect, it } from "bun:test";
import { richDocKind } from "./richDoc";

describe("richDocKind", () => {
  it("maps .pdf / .docx / .xlsx to their kinds", () => {
    expect(richDocKind({ path: "/ws/report.pdf" })).toBe("pdf");
    expect(richDocKind({ path: "/ws/合同.docx" })).toBe("docx");
    expect(richDocKind({ path: "/ws/data.xlsx" })).toBe("xlsx");
  });

  it("is case-insensitive on the extension", () => {
    expect(richDocKind({ path: "/ws/REPORT.PDF" })).toBe("pdf");
    expect(richDocKind({ path: "/ws/Doc.DocX" })).toBe("docx");
  });

  it("returns null for legacy/unsupported office formats", () => {
    expect(richDocKind({ path: "/ws/old.doc" })).toBeNull();
    expect(richDocKind({ path: "/ws/old.xls" })).toBeNull();
    expect(richDocKind({ path: "/ws/slides.pptx" })).toBeNull();
  });

  it("returns null for text/csv/code/unknown files", () => {
    expect(richDocKind({ path: "/ws/data.csv" })).toBeNull();
    expect(richDocKind({ path: "/ws/readme.md" })).toBeNull();
    expect(richDocKind({ path: "/ws/main.ts" })).toBeNull();
    expect(richDocKind({ path: "/ws/noext" })).toBeNull();
  });

  it("does not match extension-like substrings mid-path", () => {
    // 目录名里出现 .pdf 不应误判
    expect(richDocKind({ path: "/ws/archive.pdf.bak" })).toBeNull();
    expect(richDocKind({ path: "/ws/x.pdf/inner.txt" })).toBeNull();
  });
});
