import { describe, expect, it } from "bun:test";
import { computeAgentDirs } from "./runWorker";

describe("computeAgentDirs", () => {
  it("treats every folder as readable", () => {
    const dirs = computeAgentDirs([
      { path: "/a", writable: false },
      { path: "/b", writable: true },
    ]);
    expect(dirs.additionalReadDirs).toEqual(["/a", "/b"]);
  });

  it("only writable folders are writable", () => {
    const dirs = computeAgentDirs([
      { path: "/ro", writable: false },
      { path: "/rw", writable: true },
    ]);
    expect(dirs.additionalWriteDirs).toEqual(["/rw"]);
  });

  it("no folders → empty sets", () => {
    expect(computeAgentDirs([])).toEqual({
      additionalReadDirs: [],
      additionalWriteDirs: [],
    });
  });

  it("all read-only → no writable dirs", () => {
    const dirs = computeAgentDirs([
      { path: "/x", writable: false },
      { path: "/y", writable: false },
    ]);
    expect(dirs.additionalReadDirs).toEqual(["/x", "/y"]);
    expect(dirs.additionalWriteDirs).toEqual([]);
  });
});
