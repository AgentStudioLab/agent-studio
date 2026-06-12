/** Full status union supported by StatusDot — used by recent/pinned task rows. */
export type Status =
  | "done"
  | "active"
  | "awaiting"
  | "pending"
  | "failed"
  | "scheduled"
  | "cancelled";

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

/* -------------------------------------------------------------
 * ChatMessage content blocks
 * ----------
 * Each assistant/user message is a sequence of ContentBlocks rendered
 * in order. Discriminated on `type`.
 * ----------------------------------------------------------- */

/** Tool-timeline icon identifier (mapped to lucide icon in renderer) */
export type TimelineIconName =
  | "wrench"
  | "file"
  | "terminal"
  | "agent-run"
  | "book-open";

export interface TimelineSubStep {
  icon: TimelineIconName;
  title: string;
}

export interface TimelineStep {
  icon: TimelineIconName;
  title: string;
  chip?: string;
  chipVariant?: "default" | "danger";
  subSteps?: TimelineSubStep[];
}

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "preset-question"; q: string; a?: string }
  | {
      type: "tool-call-timeline";
      summary: string;
      defaultOpen?: boolean;
      steps: TimelineStep[];
    }
  | { type: "prose"; html: string }
  | {
      type: "artifact";
      name: string;
      kind: "Spreadsheet" | "Presentation" | "Document";
      ext: "XLSX" | "PPTX" | "DOCX" | "MD";
      opener: string;
    }
  | { type: "message-actions" }
  | { type: "brand-star"; size?: number; spin?: boolean };

export interface ChatMessage {
  id: string;
  from: "user" | "assistant";
  /** Preferred — discriminated content. Falls back to `content` if absent. */
  blocks?: ContentBlock[];
  /** Legacy single-string body; renderer treats as a single text block. */
  content?: string;
  toolCalls?: ToolCall[];
  artifacts?: Artifact[];
}


export interface MockFile {
  name: string;
  path: string;
  type: "markdown" | "html" | "spreadsheet" | "presentation" | "document" | "pdf" | "code" | "image" | "generic";
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
  /** Prototype HTML 636-645 uses "running" / "scheduled" / "done" / "failed".
   *  We use "active" for "running" (same visual) for parity with Status. */
  status?: Status;
  time: string;
}

export interface MockPinnedItem {
  id: string;
  kind: "task" | "project";
  name: string;
  /** For task-kind pinned items, status drives the StatusDot rendering. */
  status?: Status;
}
