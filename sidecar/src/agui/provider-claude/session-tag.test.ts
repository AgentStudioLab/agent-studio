import { describe, expect, it, mock } from "bun:test";
import { getResumeSessionId, tagThreadSession } from "./session-tag";

describe("getResumeSessionId", () => {
  it("returns sessionId of session tagged with threadId", async () => {
    const fakeList = mock(async () => [
      { sessionId: "s1", tag: "other", lastModified: 1 },
      { sessionId: "s2", tag: "thread-A", lastModified: 2 },
    ]);
    const sid = await getResumeSessionId("thread-A", "/tmp/proj", fakeList as never);
    expect(sid).toBe("s2");
  });

  it("returns undefined when no session tagged", async () => {
    const fakeList = mock(async () => [
      { sessionId: "s1", tag: undefined, lastModified: 1 },
    ]);
    const sid = await getResumeSessionId("thread-A", "/tmp/proj", fakeList as never);
    expect(sid).toBeUndefined();
  });

  it("returns undefined when listSessions throws", async () => {
    const fakeList = mock(async () => { throw new Error("boom"); });
    const sid = await getResumeSessionId("thread-A", "/tmp/proj", fakeList as never);
    expect(sid).toBeUndefined();
  });
});

describe("tagThreadSession", () => {
  it("calls tag fn with sessionId, threadId, dir options", async () => {
    const calls: unknown[] = [];
    const fakeTag = mock(async (sid: string, tag: string, opts?: { dir: string }) => {
      calls.push({ sid, tag, opts });
    });
    await tagThreadSession("s1", "thread-A", "/tmp/proj", fakeTag as never);
    expect(calls).toEqual([{ sid: "s1", tag: "thread-A", opts: { dir: "/tmp/proj" } }]);
  });

  it("swallows error from tag fn and logs", async () => {
    const fakeTag = mock(async () => { throw new Error("perm"); });
    await expect(
      tagThreadSession("s1", "thread-A", "/tmp/proj", fakeTag as never),
    ).resolves.toBeUndefined();
  });
});
