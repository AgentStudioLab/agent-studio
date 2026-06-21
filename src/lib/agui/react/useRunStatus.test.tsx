import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render, renderHook, act, screen } from "@testing-library/react";
import { useRunStatus, type RuntimeLike } from "./useRunStatus";
import { createInitialState, type ChatState } from "../runtime/types";

afterEach(() => cleanup());

function Probe({ runtime }: { runtime: RuntimeLike }) {
  const status = useRunStatus(runtime);
  return (
    <output>
      {status.status}:{status.waitingReason ?? "none"}
    </output>
  );
}

function runtimeWith(state: ChatState): RuntimeLike {
  return {
    getState: () => state,
    subscribe: () => () => {},
  };
}

// Minimal fake runtime: just getState + subscribe (matches useSyncExternalStore contract)
function makeFakeRuntime(initial: ChatState) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    subscribe: (cb: () => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    setState(next: ChatState) {
      state = next;
      for (const l of listeners) l();
    },
  };
}

describe("useRunStatus", () => {
  it("derives awaiting_user_input for ask_user interrupts", () => {
    render(
      <Probe
        runtime={runtimeWith({
          ...createInitialState(),
          pendingInterrupts: [
            {
              id: "ask_1",
              reason: "ask_user",
              payload: { toolName: "AskUserQuestion", questions: [] },
            },
          ],
        })}
      />,
    );
    expect(screen.getByText("awaiting_user:ask_user")).toBeDefined();
  });

  it("derives awaiting_tool_approval for tool approval interrupts", () => {
    render(
      <Probe
        runtime={runtimeWith({
          ...createInitialState(),
          pendingInterrupts: [
            {
              id: "tool_1",
              reason: "tool_approval",
              payload: { toolName: "Bash", input: {} },
            },
          ],
        })}
      />,
    );
    expect(screen.getByText("awaiting_user:tool_approval")).toBeDefined();
  });

  it("returns errorCode + isAuthError true for AUTH_FAILED", () => {
    const rt = makeFakeRuntime({
      ...createInitialState(),
      errorCode: "AUTH_FAILED",
      error: "authentication_failed",
    });
    const { result } = renderHook(() => useRunStatus(rt as never));
    expect(result.current.errorCode).toBe("AUTH_FAILED");
    expect(result.current.isAuthError).toBe(true);
    expect(result.current.isRetryable).toBe(false);
  });

  it("returns isRetryable=true for RATE_LIMIT / UPSTREAM_5XX", () => {
    const rt = makeFakeRuntime({ ...createInitialState(), errorCode: "RATE_LIMIT" });
    const { result } = renderHook(() => useRunStatus(rt as never));
    expect(result.current.isRetryable).toBe(true);
    expect(result.current.isAuthError).toBe(false);
  });

  it("reactively updates when runtime emits retry", () => {
    const rt = makeFakeRuntime(createInitialState());
    const { result } = renderHook(() => useRunStatus(rt as never));
    expect(result.current.retry).toBeUndefined();
    act(() => {
      rt.setState({
        ...createInitialState(),
        retry: {
          attempt: 2,
          maxRetries: 5,
          retryDelayMs: 1000,
          errorStatus: 503,
          error: "server_error",
          ts: Date.now(),
        },
      });
    });
    expect(result.current.retry?.attempt).toBe(2);
  });
});
