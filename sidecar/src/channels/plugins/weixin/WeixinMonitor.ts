import crypto from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { UnifiedIncomingAttachment } from "../../core/PluginRegistry";

const TEXT_ITEM_TYPE = 1;
const IMAGE_ITEM_TYPE = 2;
const VOICE_ITEM_TYPE = 3;
const FILE_ITEM_TYPE = 4;
const CDN_BASE_URL = "https://novac2c.cdn.weixin.qq.com/c2c";
const API_TIMEOUT_MS = 15_000;

export interface WeixinMonitorIncoming {
  chatId: string;
  senderId: string;
  text?: string;
  attachments: UnifiedIncomingAttachment[];
  contextToken?: string;
  raw?: unknown;
}

interface WeixinRawItem {
  type?: number;
  text_item?: { text?: string };
  voice_item?: { text?: string };
  image_item?: WeixinMediaData;
  file_item?: WeixinMediaData;
}

interface WeixinMediaData {
  media?: { encrypt_query_param?: string; aes_key?: string };
  aeskey?: string;
  file_name?: string;
}

interface WeixinRawMessage {
  from_user_id?: string;
  context_token?: string;
  msg_id?: string;
  item_list?: WeixinRawItem[];
}

interface MonitorOptions {
  baseUrl: string;
  token: string;
  accountId: string;
  dataDir: string;
  fetchImpl?: typeof fetch;
  onMessage?: (message: WeixinMonitorIncoming) => Promise<void>;
  log?: (message: string) => void;
}

function trimBase(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

function bufPath(dataDir: string, accountId: string): string {
  return join(dataDir, "weixin-monitor", `${accountId}.buf`);
}

function loadBuf(dataDir: string, accountId: string): string {
  try {
    return readFileSync(bufPath(dataDir, accountId), "utf8");
  } catch {
    return "";
  }
}

function saveBuf(dataDir: string, accountId: string, buf: string): void {
  mkdirSync(join(dataDir, "weixin-monitor"), { recursive: true });
  writeFileSync(bufPath(dataDir, accountId), buf);
}

function sniff(buf: Buffer): { ext: string; type: "file" | "image" } {
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { ext: ".png", type: "image" };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) return { ext: ".jpg", type: "image" };
  return { ext: ".bin", type: "file" };
}

async function apiPost<T>(
  opts: {
    baseUrl: string;
    endpoint: string;
    body: unknown;
    token: string;
    wechatUin: string;
    fetchImpl: typeof fetch;
  },
): Promise<T> {
  const body = JSON.stringify(opts.body);
  const res = await opts.fetchImpl(`${trimBase(opts.baseUrl)}/${opts.endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      AuthorizationType: "ilink_bot_token",
      Authorization: `Bearer ${opts.token}`,
      "Content-Length": String(Buffer.byteLength(body, "utf8")),
      "X-WECHAT-UIN": opts.wechatUin,
    },
    body,
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${opts.endpoint} HTTP ${res.status}`);
  return (await res.json()) as T;
}

export function createWeixinMonitor(options: MonitorOptions): {
  pollOnce: () => Promise<void>;
} {
  const fetchImpl = options.fetchImpl ?? fetch;
  const wechatUin = crypto.randomBytes(4).toString("base64");
  return {
    async pollOnce(): Promise<void> {
      const buf = loadBuf(options.dataDir, options.accountId);
      const resp = await apiPost<{
        get_updates_buf?: string;
        msgs?: WeixinRawMessage[];
      }>({
        baseUrl: options.baseUrl,
        endpoint: "ilink/bot/getupdates",
        body: { get_updates_buf: buf, base_info: {} },
        token: options.token,
        wechatUin,
        fetchImpl,
      });
      if (resp.get_updates_buf) saveBuf(options.dataDir, options.accountId, resp.get_updates_buf);
      for (const raw of resp.msgs ?? []) {
        const incoming = await rawToIncoming(raw, options.dataDir, fetchImpl);
        if (incoming) await options.onMessage?.(incoming);
      }
    },
  };
}

async function rawToIncoming(
  raw: WeixinRawMessage,
  dataDir: string,
  fetchImpl: typeof fetch,
): Promise<WeixinMonitorIncoming | null> {
  const chatId = raw.from_user_id ?? "";
  if (!chatId) return null;
  const items = raw.item_list ?? [];
  const text = items
    .map((item) => item.text_item?.text?.trim() ?? item.voice_item?.text?.trim())
    .filter((part): part is string => Boolean(part))
    .join("\n\n");
  const attachments: UnifiedIncomingAttachment[] = [];
  const mediaItems = items.filter((item) => item.type === IMAGE_ITEM_TYPE || item.type === FILE_ITEM_TYPE);
  for (const [idx, item] of mediaItems.entries()) {
    const attachment = await downloadMedia(item, raw.msg_id ?? `${Date.now()}`, idx, dataDir, fetchImpl);
    if (attachment) attachments.push(attachment);
  }
  if (!text && attachments.length === 0) return null;
  return {
    chatId,
    senderId: chatId,
    text: text || undefined,
    attachments,
    contextToken: raw.context_token,
    raw,
  };
}

async function downloadMedia(
  item: WeixinRawItem,
  msgId: string,
  idx: number,
  dataDir: string,
  fetchImpl: typeof fetch,
): Promise<UnifiedIncomingAttachment | null> {
  const data = item.image_item ?? item.file_item;
  const query = data?.media?.encrypt_query_param;
  if (!query) return null;
  const resp = await fetchImpl(
    `${CDN_BASE_URL}/download?encrypted_query_param=${encodeURIComponent(query)}`,
  );
  if (!resp.ok) throw new Error(`CDN HTTP ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  const { ext, type } = sniff(buf);
  const declaredName = String(data?.file_name ?? (type === "image" ? "image" : "file"));
  const safeMsg = msgId.replace(/[^a-zA-Z0-9._-]/g, "_");
  const fileName = `${safeMsg}-${idx}-${declaredName.replace(/[^a-zA-Z0-9._-]/g, "_")}${ext}`;
  const dir = join(dataDir, "weixin-uploads");
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, fileName);
  writeFileSync(filePath, buf);
  return { type, path: filePath, name: declaredName };
}

export async function sendWeixinOutgoing(input: {
  baseUrl: string;
  token: string;
  accountId: string;
  chatId: string;
  contextToken?: string;
  text?: string;
  files?: Array<{ type: "file" | "image"; path: string; fileName?: string; caption?: string }>;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const wechatUin = crypto.randomBytes(4).toString("base64");
  if (input.text) {
    await sendText(input.baseUrl, input.token, wechatUin, input.chatId, input.text, input.contextToken, fetchImpl);
  }
  for (const file of input.files ?? []) {
    if (file.caption) {
      await sendText(input.baseUrl, input.token, wechatUin, input.chatId, file.caption, input.contextToken, fetchImpl);
    }
    const st = statSync(file.path);
    if (!st.isFile()) throw new Error(`not a file: ${file.path}`);
    const upload = await apiPost<{ upload_full_url?: string }>({
      baseUrl: input.baseUrl,
      endpoint: "ilink/bot/getuploadurl",
      body: {
        filekey: crypto.randomBytes(16).toString("hex"),
        media_type: file.type === "image" ? 1 : 3,
        to_user_id: input.chatId,
        rawsize: st.size,
        rawfilemd5: "experimental",
        filesize: st.size,
        aeskey: crypto.randomBytes(16).toString("hex"),
        base_info: {},
      },
      token: input.token,
      wechatUin,
      fetchImpl,
    });
    const uploadUrl = upload.upload_full_url;
    if (!uploadUrl) throw new Error("getuploadurl missing upload url");
    const cdn = await fetchImpl(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: new Uint8Array(readFileSync(file.path)),
    });
    if (!cdn.ok) throw new Error(`CDN upload HTTP ${cdn.status}`);
    const downloadParam = cdn.headers.get("x-encrypted-param") ?? "";
    await apiPost({
      baseUrl: input.baseUrl,
      endpoint: "ilink/bot/sendmessage",
      body: {
        msg: {
          to_user_id: input.chatId,
          client_id: crypto.randomUUID(),
          message_type: 2,
          message_state: 2,
          context_token: input.contextToken,
          item_list: [
            file.type === "image"
              ? {
                  type: IMAGE_ITEM_TYPE,
                  image_item: { media: { encrypt_query_param: downloadParam } },
                }
              : {
                  type: FILE_ITEM_TYPE,
                  file_item: {
                    file_name: file.fileName ?? basename(file.path),
                    media: { encrypt_query_param: downloadParam },
                  },
                },
          ],
        },
        base_info: {},
      },
      token: input.token,
      wechatUin,
      fetchImpl,
    });
  }
}

async function sendText(
  baseUrl: string,
  token: string,
  wechatUin: string,
  chatId: string,
  text: string,
  contextToken: string | undefined,
  fetchImpl: typeof fetch,
): Promise<void> {
  await apiPost({
    baseUrl,
    endpoint: "ilink/bot/sendmessage",
    body: {
      msg: {
        to_user_id: chatId,
        client_id: crypto.randomUUID(),
        message_type: 2,
        message_state: 2,
        item_list: [{ type: TEXT_ITEM_TYPE, text_item: { text } }],
        context_token: contextToken,
      },
      base_info: {},
    },
    token,
    wechatUin,
    fetchImpl,
  });
}
