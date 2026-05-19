export type SseEvent =
  | { event: "message-start"; data: { messageId: string; role: "assistant" } }
  | { event: "text-delta"; data: { messageId: string; blockIndex: number; text: string } }
  | { event: "message-stop"; data: { messageId: string; finishReason: "end_turn" } }
  | { event: "error"; data: { code: string; message: string } }
  | { event: "aborted"; data: { messageId: string } };

export function encodeSseFrame<T>(event: string, data: T): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
