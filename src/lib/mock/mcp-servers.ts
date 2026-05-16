import type { MockMcpServer } from "./types";

export const mcpServers: MockMcpServer[] = [
  {
    id: "filesystem",
    name: "Filesystem",
    description: "Local file access",
    connected: true,
  },
  {
    id: "gmail",
    name: "Gmail",
    description: "Email read/send",
    connected: false,
  },
  {
    id: "github",
    name: "GitHub",
    description: "Repo + issue access",
    connected: true,
  },
];
