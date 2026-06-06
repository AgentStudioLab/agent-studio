import type { UnifiedIncomingAttachment, UnifiedIncomingMessage } from "../../core/PluginRegistry";
import type { WeixinMonitorIncoming } from "./WeixinMonitor";

export function toUnifiedIncomingMessage(input: {
  id: string;
  connectionId: string;
  incoming: WeixinMonitorIncoming;
  timestamp?: number;
}): UnifiedIncomingMessage {
  return {
    id: input.id,
    connectionId: input.connectionId,
    channelType: "weixin",
    chatId: input.incoming.chatId,
    senderId: input.incoming.senderId,
    text: stripHtml(input.incoming.text ?? "") || undefined,
    attachments: input.incoming.attachments as UnifiedIncomingAttachment[],
    contextToken: input.incoming.contextToken,
    timestamp: input.timestamp ?? Date.now(),
    raw: input.incoming.raw,
  };
}

export function stripHtml(html: string): string {
  const decoded = stripTags(html).replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (entity) => {
    if (entity === "&amp;") return "&";
    if (entity === "&lt;") return "<";
    if (entity === "&gt;") return ">";
    if (entity === "&quot;") return '"';
    if (entity === "&#39;") return "'";
    if (entity === "&nbsp;") return " ";
    return entity;
  });
  return stripTags(decoded);
}

function stripTags(value: string): string {
  let result = value;
  let previous: string;
  do {
    previous = result;
    result = result.replace(/<[^>]*>/g, "");
  } while (previous !== result);
  return result;
}
