export type StepStatus = "done" | "active" | "pending" | "failed";

export interface PlanStep {
  id: string;
  status: StepStatus;
  description: string;
}

export interface ToolCall {
  id: string;
  type: "bash" | "fs-read" | "fs-write" | "web-search" | "search";
  state: "input-streaming" | "input-available" | "output-available" | "output-error";
  input: Record<string, unknown>;
  output?: string;
  errorText?: string;
  subSteps?: { description: string }[];
}

export interface Artifact {
  id: string;
  name: string;
  type: "spreadsheet" | "presentation" | "document" | "markdown" | "code";
  opener?: string; // e.g., "wpsoffice"
}

export interface ChatMessage {
  id: string;
  from: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
  artifacts?: Artifact[];
}

export interface MockTask {
  id: string;
  title: string;
  plan: PlanStep[];
  messages: ChatMessage[];
  elapsedSeconds: number;
  status: "running" | "done" | "failed" | "paused";
}

export interface MockFile {
  name: string;
  path: string;
  type: "markdown" | "spreadsheet" | "presentation" | "code" | "image" | "generic";
  isNew?: boolean;
  content?: string; // populated for preview
}

export interface MockSkill {
  id: string;
  name: string;
  initials: string; // 字母方块 avatar
  description: string;
  hue: "orange" | "blue" | "purple" | "red" | "green" | "amber" | "stone";
}

export interface MockMcpServer {
  id: string;
  name: string;
  description: string;
  connected: boolean;
}
