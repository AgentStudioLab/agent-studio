import { afterEach, describe, expect, it } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  parseRemoteSendProtocol,
  resolveRemoteSendProtocol,
} from "./RemoteSendProtocol";

const tmpRoots: string[] = [];

function makeTaskDirs(): { root: string; outputDir: string; outsideDir: string } {
  const root = mkdtempSync(join(tmpdir(), "remote-send-"));
  tmpRoots.push(root);
  const outputDir = join(root, "output");
  const outsideDir = join(root, "outside");
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(outsideDir, { recursive: true });
  return { root, outputDir, outsideDir };
}

afterEach(() => {
  for (const root of tmpRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("parseRemoteSendProtocol", () => {
  it("parses multiple blocks and removes them from visible text", () => {
    const content = [
      "summary",
      "[AGENT_WORKS_REMOTE_SEND]",
      JSON.stringify({ type: "file", path: "output/a.txt", fileName: "a.txt" }),
      "[/AGENT_WORKS_REMOTE_SEND]",
      "more",
      "[AGENT_WORKS_REMOTE_SEND]",
      JSON.stringify({ type: "image", path: "output/b.png", caption: "preview" }),
      "[/AGENT_WORKS_REMOTE_SEND]",
    ].join("\n");

    const parsed = parseRemoteSendProtocol(content);

    expect(parsed.visibleText).toBe("summary\nmore");
    expect(parsed.actions).toEqual([
      { type: "file", path: "output/a.txt", fileName: "a.txt" },
      { type: "image", path: "output/b.png", caption: "preview" },
    ]);
  });

  it("leaves malformed blocks visible and does not create actions", () => {
    const content = [
      "summary",
      "[AGENT_WORKS_REMOTE_SEND]",
      "{bad json",
      "[/AGENT_WORKS_REMOTE_SEND]",
    ].join("\n");

    const parsed = parseRemoteSendProtocol(content);

    expect(parsed.visibleText).toContain("[AGENT_WORKS_REMOTE_SEND]");
    expect(parsed.actions).toEqual([]);
  });
});

describe("resolveRemoteSendProtocol", () => {
  it("resolves relative paths from workspace root and accepts files inside outputDir", () => {
    const { root, outputDir } = makeTaskDirs();
    const file = join(outputDir, "result.txt");
    writeFileSync(file, "done");

    const result = resolveRemoteSendProtocol({
      content: `[AGENT_WORKS_REMOTE_SEND]{"type":"file","path":"output/result.txt"}[/AGENT_WORKS_REMOTE_SEND]`,
      workspaceRoot: root,
      outputDir,
    });

    expect(result.visibleText).toBe("");
    expect(result.files).toEqual([{ type: "file", path: realpathSync(file) }]);
    expect(result.rejected).toEqual([]);
  });

  it("rejects files outside the current task outputDir", () => {
    const { root, outputDir, outsideDir } = makeTaskDirs();
    const file = join(outsideDir, "secret.txt");
    writeFileSync(file, "secret");

    const result = resolveRemoteSendProtocol({
      content: `[AGENT_WORKS_REMOTE_SEND]{"type":"file","path":"outside/secret.txt"}[/AGENT_WORKS_REMOTE_SEND]`,
      workspaceRoot: root,
      outputDir,
    });

    expect(result.files).toEqual([]);
    expect(result.rejected[0]).toMatchObject({ reason: "outside_output" });
  });

  it("rejects symlinks that point outside outputDir", () => {
    const { root, outputDir, outsideDir } = makeTaskDirs();
    const target = join(outsideDir, "secret.txt");
    const link = join(outputDir, "linked.txt");
    writeFileSync(target, "secret");
    symlinkSync(target, link);

    const result = resolveRemoteSendProtocol({
      content: `[AGENT_WORKS_REMOTE_SEND]{"type":"file","path":"output/linked.txt"}[/AGENT_WORKS_REMOTE_SEND]`,
      workspaceRoot: root,
      outputDir,
    });

    expect(result.files).toEqual([]);
    expect(result.rejected[0]).toMatchObject({ reason: "outside_output" });
  });

  it("rejects missing files, directories, and files over 200MB", () => {
    const { root, outputDir } = makeTaskDirs();
    mkdirSync(join(outputDir, "dir"));
    const large = join(outputDir, "large.bin");
    writeFileSync(large, "");
    truncateSync(large, 201 * 1024 * 1024);

    const result = resolveRemoteSendProtocol({
      content: [
        `[AGENT_WORKS_REMOTE_SEND]{"type":"file","path":"output/missing.txt"}[/AGENT_WORKS_REMOTE_SEND]`,
        `[AGENT_WORKS_REMOTE_SEND]{"type":"file","path":"output/dir"}[/AGENT_WORKS_REMOTE_SEND]`,
        `[AGENT_WORKS_REMOTE_SEND]{"type":"file","path":"output/large.bin"}[/AGENT_WORKS_REMOTE_SEND]`,
      ].join("\n"),
      workspaceRoot: root,
      outputDir,
    });

    expect(result.files).toEqual([]);
    expect(result.rejected.map((item) => item.reason)).toEqual([
      "not_found",
      "not_file",
      "too_large",
    ]);
  });
});
