import { describe, expect, it } from "bun:test";
import { startLogin } from "./WeixinLogin";

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("WeixinLogin", () => {
  it("logs the redacted confirmed login response for identity inspection", async () => {
    const originalLog = console.log;
    const logs: unknown[][] = [];
    console.log = (...args: unknown[]) => {
      logs.push(args);
    };
    try {
      let requestCount = 0;
      const fetchImpl = async () => {
        requestCount++;
        if (requestCount === 1) {
          return json({ qrcode: "qr_1", qrcode_img_content: "https://qr.example/1" });
        }
        return json({
          status: "confirmed",
          ilink_bot_id: "bot_1",
          ilink_user_id: "user_1",
          nickname: "Alice",
          avatar_url: "https://avatar.example/alice.png",
          bot_token: "token_1",
          baseurl: "https://ilink.example",
        });
      };

      const done = new Promise((resolve, reject) => {
        startLogin(
          {
            onQR: () => {},
            onScanned: () => {},
            onDone: resolve,
            onError: reject,
          },
          { fetchImpl: fetchImpl as unknown as typeof fetch, pollDelayMs: 0 },
        );
      });

      await expect(done).resolves.toEqual({
        accountId: "bot_1",
        botToken: "token_1",
        baseUrl: "https://ilink.example",
      });
    } finally {
      console.log = originalLog;
    }

    expect(logs).toEqual([
      [
        "[channels:weixin] confirmed login response",
        {
          status: "confirmed",
          ilink_bot_id: "bot_1",
          ilink_user_id: "user_1",
          nickname: "Alice",
          avatar_url: "https://avatar.example/alice.png",
          bot_token: "[redacted]",
          baseurl: "https://ilink.example",
        },
      ],
    ]);
  });

  it("continues polling on wait, emits scanned, then returns confirmed credentials", async () => {
    const originalLog = console.log;
    console.log = () => {};
    const urls: string[] = [];
    const fetchImpl = async (url: string | URL | Request) => {
      urls.push(String(url));
      if (urls.length === 1) {
        return json({ qrcode: "qr_1", qrcode_img_content: "https://qr.example/1" });
      }
      if (urls.length === 2) return json({ status: "wait" });
      if (urls.length === 3) return json({ status: "scaned" });
      return json({
        status: "confirmed",
        ilink_bot_id: "bot_1",
        bot_token: "token_1",
        baseurl: "https://ilink.example",
      });
    };
    const events: string[] = [];
    const done = new Promise((resolve, reject) => {
      startLogin(
        {
          onQR: (url, data) => events.push(`qr:${url}:${data}`),
          onScanned: () => events.push("scanned"),
          onDone: resolve,
          onError: reject,
        },
        { fetchImpl: fetchImpl as unknown as typeof fetch, pollDelayMs: 0 },
      );
    });

    try {
      await expect(done).resolves.toEqual({
        accountId: "bot_1",
        botToken: "token_1",
        baseUrl: "https://ilink.example",
      });
    } finally {
      console.log = originalLog;
    }
    expect(events).toEqual(["qr:https://qr.example/1:qr_1", "scanned"]);
    expect(urls.some((url) => url.includes("ilink/bot/get_bot_qrcode"))).toBe(true);
    expect(urls.some((url) => url.includes("ilink/bot/get_qrcode_status"))).toBe(true);
  });

  it("retries expired QR codes at most 3 times", async () => {
    let qrCount = 0;
    const fetchImpl = async (url: string | URL | Request) => {
      if (String(url).includes("get_bot_qrcode")) {
        qrCount++;
        return json({ qrcode: `qr_${qrCount}`, qrcode_img_content: "https://qr.example" });
      }
      return json({ status: "expired" });
    };
    const error = new Promise<Error>((resolve) => {
      startLogin(
        {
          onQR: () => {},
          onScanned: () => {},
          onDone: () => {},
          onError: resolve,
        },
        { fetchImpl: fetchImpl as unknown as typeof fetch, pollDelayMs: 0 },
      );
    });

    await expect(error).resolves.toEqual(new Error("QR code expired too many times"));
    expect(qrCount).toBe(3);
  });
});
