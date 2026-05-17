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

export interface MockProject {
  id: string;
  name: string;
  lastActivity: string; // ISO or "2 hours ago"
  instructions?: string;
  scheduledTasks?: string[]; // scheduled task IDs
  computerContext?: { path: string; folderName: string }[];
  memory?: string[];
  recentConversations?: Array<{
    id: string;
    title: string;
    preview: string;
    time: string;
  }>;
}

export type Frequency = "manual" | "hourly" | "daily" | "weekdays" | "weekly";

export interface MockScheduledTask {
  id: string;
  name: string;
  description: string;
  prompt: string;
  frequency: Frequency;
  timeOfDay?: string; // "09:00"
  nextRun?: string;
  active: boolean;
  alwaysAllowed?: string[]; // approvals
}

export interface MockAgent {
  id: string;
  // Categorical primitive: agent emoji is a semantic identity marker per PRD § 4.7.3,
  // not decoration. design-tokens skill exception clause allows this.
  emoji: string;
  name: string;
  description: string;
  systemPrompt: string;
  skills: string[]; // skill IDs
  mcpServers: string[]; // server IDs
  allowedProjects: string[] | "all";
  category: "my" | "built-in";
}

export interface MockPlugin {
  id: string;
  initials: string; // 2-letter avatar
  hue: "orange" | "blue" | "purple" | "red" | "green" | "amber" | "stone";
  name: string;
  author: string;
  description: string;
  rating: number;
  installs: number;
  installed: boolean;
  category:
    | "productivity"
    | "research"
    | "development"
    | "communication"
    | "design"
    | "data";
}

export interface MockRecentItem {
  id: string;
  kind: "task" | "conversation";
  title: string;
  status?: StepStatus;
  time: string;
}

export interface MockPinnedItem {
  id: string;
  kind: "task" | "project";
  name: string;
}
