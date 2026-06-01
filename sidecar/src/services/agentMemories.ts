import type { Database } from "bun:sqlite";
import { nanoid } from "nanoid";

/** Who wrote the entry: the agent (via the remember tool) or the user. */
export type MemorySource = "agent" | "user";

/** Which budgeted section a memory belongs to (no semantic retrieval — spec). */
export type MemoryBlock = "profile" | "facts";

export interface AgentMemory {
  id: string;
  agentWorkspaceId: string;
  content: string;
  source: MemorySource;
  block: MemoryBlock;
  createdAt: number;
}

interface AgentMemoryRow {
  id: string;
  agent_workspace_id: string;
  content: string;
  source: MemorySource;
  block: MemoryBlock;
  created_at: number;
}

function rowToMemory(r: AgentMemoryRow): AgentMemory {
  return {
    id: r.id,
    agentWorkspaceId: r.agent_workspace_id,
    content: r.content,
    source: r.source,
    block: r.block,
    createdAt: r.created_at,
  };
}

export interface CreateAgentMemoryInput {
  agentWorkspaceId: string;
  content: string;
  source: MemorySource;
  /** Defaults to 'facts' — the generic bucket for existing/unspecified entries. */
  block?: MemoryBlock;
}

/**
 * Outcome of an agent-issued replace/remove (substring-targeted). The remember
 * tool turns this into model-facing text so the agent can self-correct.
 */
export type MemoryEditResult =
  | { status: "ok"; message: string }
  | { status: "no_match" }
  | { status: "ambiguous"; matches: string[] };

/**
 * Linear memory entries for an agent (no semantic retrieval — spec §15).
 * Split into 'profile'/'facts' blocks, each injected as its own budgeted
 * section in systemPrompt.append on every agent-bound run. The agent edits its
 * own rows (source='agent') via the remember tool's add/replace/remove; user
 * rows (source='user') are read-only to the agent.
 */
export class AgentMemoryService {
  constructor(private db: Database) {}

  create(input: CreateAgentMemoryInput): AgentMemory {
    const id = `agm_${nanoid(12)}`;
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO agent_memories (id, agent_workspace_id, content, source, block, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.agentWorkspaceId, input.content, input.source, input.block ?? "facts", now);
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

  listByAgentBlock(agentWorkspaceId: string, block: MemoryBlock): AgentMemory[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM agent_memories WHERE agent_workspace_id = ? AND block = ? ORDER BY created_at ASC, rowid ASC",
      )
      .all(agentWorkspaceId, block) as AgentMemoryRow[];
    return rows.map(rowToMemory);
  }

  /** Total content characters in a block (proxy for token budget; no tokenizer). */
  blockCharLength(agentWorkspaceId: string, block: MemoryBlock): number {
    return this.listByAgentBlock(agentWorkspaceId, block).reduce(
      (sum, m) => sum + m.content.length,
      0,
    );
  }

  /**
   * Replace an agent-written row in `block` located by case-insensitive
   * substring `match`. Only source='agent' rows are editable. Ambiguous (>1
   * match) and no-match return a result the caller surfaces — they do NOT
   * mutate, so the agent must be more specific.
   */
  replaceAgentRow(
    agentWorkspaceId: string,
    block: MemoryBlock,
    match: string,
    newContent: string,
  ): MemoryEditResult {
    const hits = this.matchAgentRows(agentWorkspaceId, block, match);
    if (hits.length === 0) return { status: "no_match" };
    if (hits.length > 1) return { status: "ambiguous", matches: hits.map((h) => h.content) };
    this.db
      .prepare("UPDATE agent_memories SET content = ? WHERE id = ?")
      .run(newContent, hits[0]!.id);
    return { status: "ok", message: newContent };
  }

  /** Delete an agent-written row in `block` located by substring `match`. */
  removeAgentRow(agentWorkspaceId: string, block: MemoryBlock, match: string): MemoryEditResult {
    const hits = this.matchAgentRows(agentWorkspaceId, block, match);
    if (hits.length === 0) return { status: "no_match" };
    if (hits.length > 1) return { status: "ambiguous", matches: hits.map((h) => h.content) };
    this.delete(hits[0]!.id);
    return { status: "ok", message: hits[0]!.content };
  }

  /**
   * Backstop: drop the oldest source='agent' rows in `block` until its char
   * length is ≤ softBudget. NEVER drops source='user' rows — if user rows alone
   * exceed the budget we respect them and stop. Returns rows dropped.
   */
  trimBlockToBudget(agentWorkspaceId: string, block: MemoryBlock, softBudget: number): number {
    let dropped = 0;
    // Oldest-first; user rows are skipped, so we always remove the oldest agent
    // row available. Re-list each pass to recompute length against the budget.
    while (this.blockCharLength(agentWorkspaceId, block) > softBudget) {
      const oldestAgent = this.listByAgentBlock(agentWorkspaceId, block).find(
        (m) => m.source === "agent",
      );
      if (!oldestAgent) break; // only user rows remain — respect them.
      this.delete(oldestAgent.id);
      dropped++;
    }
    return dropped;
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM agent_memories WHERE id = ?").run(id);
  }

  /** Agent-written rows in `block` whose content contains `match` (case-insensitive). */
  private matchAgentRows(
    agentWorkspaceId: string,
    block: MemoryBlock,
    match: string,
  ): AgentMemory[] {
    const needle = match.toLowerCase();
    return this.listByAgentBlock(agentWorkspaceId, block).filter(
      (m) => m.source === "agent" && m.content.toLowerCase().includes(needle),
    );
  }
}
