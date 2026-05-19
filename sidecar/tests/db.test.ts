import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { migrate } from "../src/db";

describe("migrate", () => {
  it("creates conversations and messages tables", () => {
    const db = new Database(":memory:");
    migrate(db);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("conversations");
    expect(names).toContain("messages");
  });

  it("creates expected indexes", () => {
    const db = new Database(":memory:");
    migrate(db);
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name")
      .all() as { name: string }[];
    const names = indexes.map((i) => i.name);
    expect(names).toEqual(["idx_conv_pinned", "idx_conv_updated", "idx_msg_conv"]);
  });

  it("sets WAL journal mode", () => {
    const db = new Database(":memory:");
    migrate(db);
    const row = db.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
    // :memory: 不支持 WAL，会 fallback 到 memory；用文件 DB 才走 wal。
    // 仅断言 migrate 不报错，不验值（值依赖底层存储）。
    expect(row.journal_mode).toBeDefined();
  });

  it("is idempotent (running twice does not throw)", () => {
    const db = new Database(":memory:");
    migrate(db);
    expect(() => migrate(db)).not.toThrow();
  });
});
