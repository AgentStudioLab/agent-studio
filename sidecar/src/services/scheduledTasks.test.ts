import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { migrate } from "../db";
import {
  ScheduledTaskService,
  computeNextRunAt,
  staggerOffset,
} from "./scheduledTasks";

function freshDb(): Database {
  const db = new Database(":memory:");
  migrate(db);
  return db;
}

describe("computeNextRunAt", () => {
  it("returns null for manual frequency", () => {
    expect(computeNextRunAt("manual", "09:00", Date.now())).toBeNull();
  });

  it("daily lands on the configured local time, strictly in the future", () => {
    const from = new Date(2026, 0, 1, 12, 0, 0).getTime(); // Jan 1, noon local
    const next = computeNextRunAt("daily", "09:00", from)!;
    const d = new Date(next);
    expect(next).toBeGreaterThan(from);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(0);
    // noon already past 09:00 → must roll to the next day.
    expect(d.getDate()).toBe(2);
  });

  it("daily preserves wall-clock time across a full year (DST-safe)", () => {
    // If the implementation added a fixed 86_400_000ms instead of constructing
    // local wall-clock time, the hour would drift by ±1 across DST. Walking a
    // year guarantees we cross any DST boundary in the host timezone.
    let from = new Date(2026, 0, 1, 0, 0, 0).getTime();
    for (let i = 0; i < 400; i++) {
      const next = computeNextRunAt("daily", "09:00", from)!;
      const d = new Date(next);
      expect(next).toBeGreaterThan(from);
      expect(d.getHours()).toBe(9);
      expect(d.getMinutes()).toBe(0);
      from = next + 60_000; // step just past the fire so the next iteration rolls a day.
    }
  });

  it("weekdays never lands on Sat/Sun", () => {
    let from = new Date(2026, 0, 1, 0, 0, 0).getTime();
    for (let i = 0; i < 30; i++) {
      const next = computeNextRunAt("weekdays", "09:00", from)!;
      const dow = new Date(next).getDay();
      expect(dow).toBeGreaterThanOrEqual(1);
      expect(dow).toBeLessThanOrEqual(5);
      from = next + 60_000;
    }
  });

  it("weekly always lands on the anchor weekday", () => {
    const anchor = 3; // Wednesday
    let from = new Date(2026, 0, 1, 0, 0, 0).getTime();
    for (let i = 0; i < 10; i++) {
      const next = computeNextRunAt("weekly", "09:00", from, anchor)!;
      expect(new Date(next).getDay()).toBe(anchor);
      from = next + 60_000;
    }
  });

  it("hourly fires at the configured minute within the next hour", () => {
    const from = new Date(2026, 0, 1, 10, 45, 0).getTime();
    const next = computeNextRunAt("hourly", "09:30", from)!; // only minute (30) matters
    const d = new Date(next);
    expect(d.getMinutes()).toBe(30);
    expect(next).toBeGreaterThan(from);
    expect(next - from).toBeLessThanOrEqual(60 * 60_000);
  });
});

describe("staggerOffset", () => {
  it("is deterministic and within [0, 10min)", () => {
    const a = staggerOffset("sched_abc");
    const b = staggerOffset("sched_abc");
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(10 * 60_000);
  });

  it("differs across ids (probabilistically)", () => {
    expect(staggerOffset("sched_abc")).not.toBe(staggerOffset("sched_xyz"));
  });
});

describe("ScheduledTaskService", () => {
  it("computes next_run_at on create for an enabled recurring task", () => {
    const svc = new ScheduledTaskService(freshDb());
    const t = svc.create({
      name: "Daily brief",
      prompt: "汇总今日日程",
      frequency: "daily",
      timeOfDay: "09:00",
    });
    expect(t.nextRunAt).not.toBeNull();
    expect(t.nextRunAt!).toBeGreaterThan(Date.now());
    expect(t.enabled).toBe(true);
  });

  it("list filters by agentWorkspaceId", () => {
    const svc = new ScheduledTaskService(freshDb());
    svc.create({ name: "bound", prompt: "x", frequency: "manual", agentWorkspaceId: "agw_1" });
    svc.create({ name: "other", prompt: "x", frequency: "manual", agentWorkspaceId: "agw_2" });
    svc.create({ name: "unbound", prompt: "x", frequency: "manual" });
    expect(svc.list().length).toBe(3);
    expect(svc.list({ agentWorkspaceId: "agw_1" }).map((t) => t.name)).toEqual(["bound"]);
  });

  it("leaves next_run_at null for manual and disabled tasks", () => {
    const svc = new ScheduledTaskService(freshDb());
    const manual = svc.create({
      name: "On demand",
      prompt: "x",
      frequency: "manual",
    });
    expect(manual.nextRunAt).toBeNull();

    const disabled = svc.create({
      name: "Off",
      prompt: "x",
      frequency: "daily",
      enabled: false,
    });
    expect(disabled.nextRunAt).toBeNull();
  });

  it("dueTasks respects the next_run_at <= now boundary", () => {
    const svc = new ScheduledTaskService(freshDb());
    const t = svc.create({
      name: "Hourly",
      prompt: "x",
      frequency: "hourly",
      timeOfDay: "00:00",
    });
    expect(svc.dueTasks(Date.now())).toHaveLength(0); // scheduled in the future
    const due = svc.dueTasks(t.nextRunAt!); // exactly at the boundary
    expect(due.map((d) => d.id)).toContain(t.id);
  });

  it("advance stamps last_run_at and rolls next_run_at forward (catch-up)", () => {
    const svc = new ScheduledTaskService(freshDb());
    const t = svc.create({
      name: "Daily",
      prompt: "x",
      frequency: "daily",
      timeOfDay: "09:00",
    });
    const now = Date.now();
    svc.advance(t.id, now);
    const after = svc.get(t.id)!;
    expect(after.lastRunAt).toBe(now);
    expect(after.nextRunAt!).toBeGreaterThan(now);
  });

  it("recomputes next_run_at when cadence fields change", () => {
    const svc = new ScheduledTaskService(freshDb());
    const t = svc.create({
      name: "Daily",
      prompt: "x",
      frequency: "daily",
      timeOfDay: "09:00",
    });
    expect(t.nextRunAt).not.toBeNull();

    const toManual = svc.update(t.id, { frequency: "manual" })!;
    expect(toManual.nextRunAt).toBeNull();

    const disabled = svc.update(t.id, { frequency: "daily", enabled: false })!;
    expect(disabled.nextRunAt).toBeNull();

    const reenabled = svc.update(t.id, { enabled: true })!;
    expect(reenabled.nextRunAt).not.toBeNull();
  });

  it("anchors weekly to the explicit weekday when set", () => {
    const svc = new ScheduledTaskService(freshDb());
    const t = svc.create({
      name: "Weekly",
      prompt: "x",
      frequency: "weekly",
      timeOfDay: "09:00",
      weekday: 2, // Tuesday
    });
    expect(t.weekday).toBe(2);
    expect(new Date(t.nextRunAt!).getDay()).toBe(2);
  });

  it("round-trips workingDir / model / permissionMode", () => {
    const svc = new ScheduledTaskService(freshDb());
    const t = svc.create({
      name: "x",
      prompt: "x",
      frequency: "daily",
      workingDir: "/Users/me/gitlab",
      model: "deepseek-reasoner",
      permissionMode: "act-without-asking",
    });
    expect(t.workingDir).toBe("/Users/me/gitlab");
    expect(t.model).toBe("deepseek-reasoner");
    expect(t.permissionMode).toBe("act-without-asking");
    // survives a reload + a partial update
    expect(svc.get(t.id)!.workingDir).toBe("/Users/me/gitlab");
    const updated = svc.update(t.id, { model: "claude-opus-4-7", permissionMode: "ask" })!;
    expect(updated.model).toBe("claude-opus-4-7");
    expect(updated.permissionMode).toBe("ask");
    expect(updated.workingDir).toBe("/Users/me/gitlab");
  });

  it("round-trips the allow-list", () => {
    const svc = new ScheduledTaskService(freshDb());
    const t = svc.create({
      name: "x",
      prompt: "x",
      frequency: "manual",
      allowedTools: ["Read", "Write"],
    });
    expect(t.allowedTools).toEqual(["Read", "Write"]);
    const updated = svc.update(t.id, { allowedTools: ["Bash"] })!;
    expect(updated.allowedTools).toEqual(["Bash"]);
  });

  it("armAll backfills next_run_at lost between fire and advance", () => {
    const db = freshDb();
    const svc = new ScheduledTaskService(db);
    const t = svc.create({
      name: "Daily",
      prompt: "x",
      frequency: "daily",
      timeOfDay: "09:00",
    });
    db.prepare("UPDATE scheduled_tasks SET next_run_at = NULL WHERE id = ?").run(t.id);
    expect(svc.get(t.id)!.nextRunAt).toBeNull();
    svc.armAll(Date.now());
    expect(svc.get(t.id)!.nextRunAt).not.toBeNull();
  });
});
