export interface AGUIInterrupt {
  id: string;
  reason: "tool_approval" | "ask_user" | "unknown";
  payload: Record<string, unknown>;
}
