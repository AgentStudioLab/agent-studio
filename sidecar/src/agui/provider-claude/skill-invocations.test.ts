import { describe, expect, it } from "bun:test";
import {
  SkillInvocationStore,
  createSkillInvocationsHook,
} from "./skill-invocations";

const callOpts = { signal: new AbortController().signal };

describe("SkillInvocationStore", () => {
  it("dedupes invocations of the same skill within a thread", () => {
    const s = new SkillInvocationStore();
    s.record("t1", "agent-studio:pptx");
    s.record("t1", "agent-studio:pptx");
    expect(s.list("t1")).toEqual(["agent-studio:pptx"]);
  });

  it("isolates state across threads", () => {
    const s = new SkillInvocationStore();
    s.record("t1", "a");
    s.record("t2", "b");
    expect(s.list("t1")).toEqual(["a"]);
    expect(s.list("t2")).toEqual(["b"]);
    expect(s.list("unknown")).toEqual([]);
  });
});

describe("createSkillInvocationsHook", () => {
  it("records skill id on PreToolUse(Skill)", async () => {
    const store = new SkillInvocationStore();
    const hook = createSkillInvocationsHook(store, "tid");
    const out = await hook(
      {
        hook_event_name: "PreToolUse",
        tool_name: "Skill",
        tool_use_id: "u1",
        tool_input: { skill: "agent-studio:pptx", args: "make a deck" },
      } as never,
      undefined,
      callOpts,
    );
    expect(out).toEqual({});
    expect(store.list("tid")).toEqual(["agent-studio:pptx"]);
  });

  it("ignores non-Skill tools", async () => {
    const store = new SkillInvocationStore();
    const hook = createSkillInvocationsHook(store, "tid");
    await hook(
      {
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_use_id: "u1",
        tool_input: { command: "ls" },
      } as never,
      undefined,
      callOpts,
    );
    expect(store.list("tid")).toEqual([]);
  });

  it("ignores PostToolUse + other event kinds", async () => {
    const store = new SkillInvocationStore();
    const hook = createSkillInvocationsHook(store, "tid");
    await hook(
      {
        hook_event_name: "PostToolUse",
        tool_name: "Skill",
        tool_use_id: "u1",
        tool_input: { skill: "agent-studio:pptx" },
      } as never,
      undefined,
      callOpts,
    );
    expect(store.list("tid")).toEqual([]);
  });

  it("ignores malformed Skill input (missing/non-string skill)", async () => {
    const store = new SkillInvocationStore();
    const hook = createSkillInvocationsHook(store, "tid");
    await hook(
      {
        hook_event_name: "PreToolUse",
        tool_name: "Skill",
        tool_use_id: "u1",
        tool_input: { skill: 42 },
      } as never,
      undefined,
      callOpts,
    );
    await hook(
      {
        hook_event_name: "PreToolUse",
        tool_name: "Skill",
        tool_use_id: "u2",
        tool_input: {},
      } as never,
      undefined,
      callOpts,
    );
    expect(store.list("tid")).toEqual([]);
  });
});
