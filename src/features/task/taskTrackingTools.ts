const TASK_TRACKING_TOOL_NAMES = new Set([
  "TaskCreate",
  "TaskGet",
  "TaskUpdate",
  "TaskList",
]);

export function isTaskTrackingToolName(toolName: string): boolean {
  return TASK_TRACKING_TOOL_NAMES.has(toolName);
}
