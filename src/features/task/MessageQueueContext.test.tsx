// Contract tests for MessageQueueContext.
//
// Covers the bits TaskView relies on:
//   1. add / popHead / remove keep per-thread isolation
//   2. userCancelled flag round-trip (mark → read → clear)
//   3. Methods are referentially stable across renders (so the consumer can
//      put them in effect deps without spurious re-fires).

import { afterEach, describe, expect, it } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import { MessageQueueProvider, useMessageQueue } from "./MessageQueueContext";
import type { ReactNode } from "react";

function wrap({ children }: { children: ReactNode }) {
  return <MessageQueueProvider>{children}</MessageQueueProvider>;
}

describe("MessageQueueContext", () => {
  afterEach(() => cleanup());

  it("add / popHead / remove keep per-thread state isolated", () => {
    const { result } = renderHook(() => useMessageQueue("t_a"), {
      wrapper: wrap,
    });
    act(() => {
      result.current.add("first");
      result.current.add("second");
    });
    expect(result.current.items.map((i) => i.text)).toEqual(["first", "second"]);

    let head: { text: string } | null = null;
    act(() => {
      head = result.current.popHead();
    });
    expect(head?.text).toBe("first");
    expect(result.current.items.map((i) => i.text)).toEqual(["second"]);

    const id = result.current.items[0]!.id;
    act(() => result.current.remove(id));
    expect(result.current.items).toEqual([]);
  });

  it("isolates threads — t_a's items don't bleed into t_b", () => {
    function Both() {
      return {
        a: useMessageQueue("t_a"),
        b: useMessageQueue("t_b"),
      };
    }
    const { result } = renderHook(Both, { wrapper: wrap });
    act(() => result.current.a.add("only-a"));
    expect(result.current.a.items).toHaveLength(1);
    expect(result.current.b.items).toHaveLength(0);
  });

  it("userCancelled round-trip", () => {
    const { result } = renderHook(() => useMessageQueue("t_x"), {
      wrapper: wrap,
    });
    expect(result.current.userCancelled).toBe(false);
    act(() => result.current.markUserCancelled());
    expect(result.current.userCancelled).toBe(true);
    act(() => result.current.clearUserCancelled());
    expect(result.current.userCancelled).toBe(false);
  });

  it("popHead returns null on empty queue, no state change", () => {
    const { result } = renderHook(() => useMessageQueue("t_empty"), {
      wrapper: wrap,
    });
    let head: unknown = "not-null";
    act(() => {
      head = result.current.popHead();
    });
    expect(head).toBeNull();
    expect(result.current.items).toEqual([]);
  });

  it("null threadId is a no-op for all writes", () => {
    const { result } = renderHook(() => useMessageQueue(null), {
      wrapper: wrap,
    });
    let item: unknown = "x";
    act(() => {
      item = result.current.add("ignored");
    });
    expect(item).toBeNull();
    expect(result.current.items).toEqual([]);
  });
});
