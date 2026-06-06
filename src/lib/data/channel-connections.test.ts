import { beforeEach, describe, expect, it, mock } from "bun:test";

const fetchSidecarMock = mock(async () => new Response("{}"));

mock.module("../sidecar-client", () => ({
  fetchSidecar: fetchSidecarMock,
}));

const api = require("./channel-connections") as typeof import("./channel-connections");

beforeEach(() => {
  fetchSidecarMock.mockReset();
});

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("channel connection data client", () => {
  it("lists channel connections", async () => {
    fetchSidecarMock.mockResolvedValueOnce(json({ connections: [] }));

    await expect(api.listChannelConnections()).resolves.toEqual([]);

    expect(fetchSidecarMock).toHaveBeenCalledWith("/channels/connections");
  });

  it("patches connection config", async () => {
    fetchSidecarMock.mockResolvedValueOnce(json({ connection: { id: "c1" } }));

    await api.updateChannelConnection("c1", {
      config: { defaultWorkspace: "/tmp" },
    });

    expect(fetchSidecarMock).toHaveBeenCalledWith(
      "/channels/connections/c1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ config: { defaultWorkspace: "/tmp" } }),
      }),
    );
  });

  it("enables and disables connections", async () => {
    fetchSidecarMock
      .mockResolvedValueOnce(json({ connection: { id: "c1" } }))
      .mockResolvedValueOnce(json({ connection: { id: "c1" } }));

    await api.enableChannelConnection("c1");
    await api.disableChannelConnection("c1");

    expect(fetchSidecarMock).toHaveBeenNthCalledWith(
      1,
      "/channels/connections/c1/enable",
      { method: "POST" },
    );
    expect(fetchSidecarMock).toHaveBeenNthCalledWith(
      2,
      "/channels/connections/c1/disable",
      { method: "POST" },
    );
  });

  it("starts and polls weixin login", async () => {
    fetchSidecarMock
      .mockResolvedValueOnce(json({ loginId: "login_1" }))
      .mockResolvedValueOnce(json({ status: { status: "scanned" } }));

    await expect(api.startWeixinLogin()).resolves.toEqual({ loginId: "login_1" });
    await expect(api.getWeixinLoginStatus("login_1")).resolves.toEqual({
      status: "scanned",
    });
  });

  it("sends fake channel incoming messages for development tests", async () => {
    fetchSidecarMock.mockResolvedValueOnce(json({ ok: true }));

    await api.sendFakeChannelIncoming("c1", {
      chatId: "chat_1",
      senderId: "sender_1",
      text: "hello",
    });

    expect(fetchSidecarMock).toHaveBeenCalledWith(
      "/channels/fake/c1/incoming",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
