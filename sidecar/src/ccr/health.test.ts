import { describe, expect, it, mock } from "bun:test";
import { waitForCcrReady, waitForPortClosed } from "./health";

describe("CCR health helpers", () => {
  it("treats a failed fetch as a closed port", async () => {
    const fetchMock = mock(async () => {
      throw new Error("connection refused");
    });

    await waitForPortClosed("http://127.0.0.1:3456", {
      timeoutMs: 50,
      intervalMs: 1,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalled();
  });

  it("times out while the old CCR endpoint is still reachable", async () => {
    const fetchMock = mock(async () => new Response("ok", { status: 200 }));

    await expect(
      waitForPortClosed("http://127.0.0.1:3456", {
        timeoutMs: 5,
        intervalMs: 1,
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toThrow("ccr_port_still_open");
  });

  it("keeps waiting when one port-close probe hangs during transition", async () => {
    let calls = 0;
    const fetchMock = mock(async () => {
      calls += 1;
      if (calls === 1) {
        await new Promise<void>(() => {});
      }
      throw new Error("connection refused");
    });

    await waitForPortClosed("http://127.0.0.1:3456", {
      timeoutMs: 20,
      intervalMs: 1,
      probeTimeoutMs: 1,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses the overall timeout when port-close probes keep hanging", async () => {
    const fetchMock = mock(async () => {
      await new Promise<void>(() => {});
      return new Response("never");
    });

    await expect(
      waitForPortClosed("http://127.0.0.1:3456", {
        timeoutMs: 5,
        intervalMs: 1,
        probeTimeoutMs: 1,
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toThrow("ccr_port_still_open");
  });

  it("keeps waiting when one ready probe hangs during startup", async () => {
    let calls = 0;
    const fetchMock = mock(async () => {
      calls += 1;
      if (calls === 1) {
        await new Promise<void>(() => {});
      }
      return new Response("ok", { status: 200 });
    });

    await waitForCcrReady("http://127.0.0.1:3456", {
      timeoutMs: 20,
      intervalMs: 1,
      probeTimeoutMs: 1,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses the overall timeout when ready probes keep hanging", async () => {
    const fetchMock = mock(async () => {
      await new Promise<void>(() => {});
      return new Response("never");
    });

    await expect(
      waitForCcrReady("http://127.0.0.1:3456", {
        timeoutMs: 5,
        intervalMs: 1,
        probeTimeoutMs: 1,
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toThrow("ccr_not_ready:ccr_ready_probe_timeout");
  });
});
