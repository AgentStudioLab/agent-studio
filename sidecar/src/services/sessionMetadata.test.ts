import { describe, expect, it } from "bun:test";
import { SessionMetadataStore } from "./sessionMetadata";

describe("SessionMetadataStore", () => {
  it("returns undefined for unknown threadId", () => {
    const store = new SessionMetadataStore();
    expect(store.get("nope")).toBeUndefined();
  });

  it("upsert + get round-trips", () => {
    const store = new SessionMetadataStore();
    store.upsert("thr_a", {
      mcpServers: [{ name: "github", status: "connected" }],
      tools: ["Read", "Write"],
    });
    const got = store.get("thr_a");
    expect(got?.mcpServers).toEqual([{ name: "github", status: "connected" }]);
    expect(got?.tools).toEqual(["Read", "Write"]);
    expect(typeof got?.updatedAt).toBe("number");
  });

  it("upsert overwrites previous", () => {
    const store = new SessionMetadataStore();
    store.upsert("thr_a", { mcpServers: [], tools: ["Read"] });
    store.upsert("thr_a", {
      mcpServers: [{ name: "slack", status: "connected" }],
      tools: ["Bash"],
    });
    expect(store.get("thr_a")?.tools).toEqual(["Bash"]);
    expect(store.get("thr_a")?.mcpServers).toEqual([
      { name: "slack", status: "connected" },
    ]);
  });
});
