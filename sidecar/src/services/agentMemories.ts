import type { Database } from "bun:sqlite";
import { nanoid } from "nanoid";

/** Who wrote the entry: the agent (via the remember tool) or the user. */
export type MemorySource = "agent" | "user";

export interface AgentMemory {
  id: string;
  agentWorkspaceId: string;
  content: string;
  source: MemorySource;
  createdAt: number;
}

interface AgentMemoryRow {
  id: string;
  agent_workspace_id: string;
  content: string;
  source: MemorySource;
  created_at: number;
}

function rowToMemory(r: AgentMemoryRow): AgentMemory {
  return {
    id: r.id,
    agentWorkspaceId: r.agent_workspace_id,
    content: r.content,
    source: r.source,
    createdAt: r.created_at,
  };
}

export interface CreateAgentMemoryInput {
  agentWorkspaceId: string;
  content: string;
  source: MemorySource;
}

/**
 * Linear memory entries for an agent (no semantic retrieval — spec §15).
 * Injected into systemPrompt.append on each agent-bound run.
 */
export class AgentMemoryService {
  constructor(private db: Database) {}

  create(input: CreateAgentMemoryInput): AgentMemory {
    const id = `agm_${nanoid(12)}`;
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO agent_memories (id, agent_workspace_id, content, source, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(id, input.agentWorkspaceId, input.content, input.source, now);
    return this.get(id)!;
  }

  get(id: string): AgentMemory | null {
    const row = this.db
      .prepare("SELECT * FROM agent_memories WHERE id = ?")
      .get(id) as AgentMemoryRow | undefined;
    return row ? rowToMemory(row) : null;
  }

  listByAgent(agentWorkspaceId: string): AgentMemory[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM agent_memories WHERE agent_workspace_id = ? ORDER BY created_at ASC, rowid ASC",
      )
      .all(agentWorkspaceId) as AgentMemoryRow[];
    return rows.map(rowToMemory);
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM agent_memories WHERE id = ?").run(id);
  }
}
