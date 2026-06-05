import { afterEach, describe, expect, it, mock } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createWeixinMonitor,
  sendWeixinOutgoing,
  type WeixinMonitorIncoming,
} from "./WeixinMonitor";

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "weixin-monitor-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  mock.restore();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function response(data: unknown, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json", ...(headers ?? {}) },
  });
}

describe("WeixinMonitor", () => {
  it("sends getupdates with auth headers and persists get_updates_buf", async () => {
    const root = makeRoot();
    const requests: Request[] = [];
    const fetchImpl = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Request(input, init));
      return response({ get_updates_buf: "buf_next", msgs: [] });
    });
    const monitor = createWeixinMonitor({
      baseUrl: "https://ilink.example",
      token: "token_1",
      accountId: "bot_1",
      dataDir: root,
      fetchImpl,
    });

    await monitor.pollOnce();
    await monitor.pollOnce();

    expect(requests[0].url).toBe("https://ilink.example/ilink/bot/getupdates");
    expect(requests[0].headers.get("AuthorizationType")).toBe("ilink_bot_token");
    expect(requests[0].headers.get("Authorization")).toBe("Bearer token_1");
    expect(requests[0].headers.get("X-WECHAT-UIN")).toBeTruthy();
    expect(await requests[1].json()).toMatchObject({ get_updates_buf: "buf_next" });
    expect(readFileSync(join(root, "weixin-monitor", "bot_1.buf"), "utf8")).toBe(
      "buf_next",
    );
  });

  it("converts text and downloaded image/file items to unified incoming messages", async () => {
    const root = makeRoot();
    const downloadedBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const fetchImpl = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/download?")) return new Response(downloadedBytes);
      return response({
        get_updates_buf: "buf_next",
        msgs: [
          {
            from_user_id: "user_1",
            context_token: "ctx_1",
            msg_id: "msg_1",
            item_list: [
              { type: 1, text_item: { text: "hello" } },
              {
                type: 2,
                image_item: {
                  media: { encrypt_query_param: "download_param" },
                  file_name: "pic",
                },
              },
            ],
          },
        ],
      });
    });
    const incoming: WeixinMonitorIncoming[] = [];
    const monitor = createWeixinMonitor({
      baseUrl: "https://ilink.example",
      token: "token_1",
      accountId: "bot_1",
      dataDir: root,
      fetchImpl,
      onMessage: async (message) => incoming.push(message),
    });

    await monitor.pollOnce();

    expect(incoming).toHaveLength(1);
    expect(incoming[0]).toMatchObject({
      chatId: "user_1",
      senderId: "user_1",
      text: "hello",
      contextToken: "ctx_1",
      attachments: [expect.objectContaining({ type: "image", name: "pic" })],
    });
  });

  it("sends outgoing text and files through sendmessage/getuploadurl/CDN upload", async () => {
    const root = makeRoot();
    const file = join(root, "out.txt");
    writeFileSync(file, "hello");
    const urls: string[] = [];
    const fetchImpl = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      urls.push(String(input));
      if (String(input).includes("getuploadurl")) {
        return response({ upload_full_url: "https://cdn.example/upload" });
      }
      if (String(input).includes("cdn.example")) {
        return new Response("", {
          status: 200,
          headers: { "x-encrypted-param": "download_param" },
        });
      }
      return response({ ret: 0 });
    });

    await sendWeixinOutgoing({
      baseUrl: "https://ilink.example",
      token: "token_1",
      accountId: "bot_1",
      chatId: "user_1",
      contextToken: "ctx_1",
      text: "Done",
      files: [{ type: "file", path: file, fileName: "out.txt" }],
      fetchImpl,
    });

    expect(urls).toEqual([
      "https://ilink.example/ilink/bot/sendmessage",
      "https://ilink.example/ilink/bot/getuploadurl",
      "https://cdn.example/upload",
      "https://ilink.example/ilink/bot/sendmessage",
    ]);
  });
});
