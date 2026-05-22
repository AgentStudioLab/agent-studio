import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { migrate } from "../db";
import { SettingsToolsService, DEFAULT_ALLOWED_TOOLS } from "./settings-tools";

function makeDb() {
  const db = new Database(":memory:");
  migrate(db);
  return db;
}

describe("SettingsToolsService", () => {
  it("returns DEFAULT_ALLOWED_TOOLS when KV unset", () => {
    const svc = new SettingsToolsService(makeDb());
    expect(svc.getDefault()).toEqual(DEFAULT_ALLOWED_TOOLS);
  });

  it("setDefault persists and getDefault reads back", () => {
    const svc = new SettingsToolsService(makeDb());
    svc.setDefault(["Bash", "Read"]);
    expect(svc.getDefault()).toEqual(["Bash", "Read"]);
  });

  it("setDefault with empty array means read-only mode", () => {
    const svc = new SettingsToolsService(makeDb());
    svc.setDefault([]);
    expect(svc.getDefault()).toEqual([]);
  });
});
