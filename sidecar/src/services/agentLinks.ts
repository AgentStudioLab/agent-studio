import type { Database } from "bun:sqlite";
import { nanoid } from "nanoid";

export interface AgentLink {
  id: string;
  agentWorkspaceId: string;
  /** The reference URL (http/https). */
  url: string;
  /** Display title (defaults to the URL host when the caller omits it). */
  title: string;
  createdAt: number;
}

interface AgentLinkRow {
  id: string;
  agent_workspace_id: string;
  url: string;
  title: string;
  created_at: number;
}

function rowToLink(r: AgentLinkRow): AgentLink {
  return {
    id: r.id,
    agentWorkspaceId: r.agent_workspace_id,
    url: r.url,
    title: r.title,
    createdAt: r.created_at,
  };
}

export interface CreateAgentLinkInput {
  agentWorkspaceId: string;
  url: string;
  title: string;
}

/**
 * URLs mounted into an agent workspace as on-demand reference context. Stored
 * only — the runWorker injects them into systemPrompt.append as a one-line list
 * the agent fetches with WebFetch when relevant (no fetch-on-add, no RAG).
 */
export class AgentLinkService {
  constructor(private db: Database) {}

  create(input: CreateAgentLinkInput): AgentLink {
    const id = `alk_${nanoid(12)}`;
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO agent_links (id, agent_workspace_id, url, title, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(id, input.agentWorkspaceId, input.url, input.title, now);
    return this.get(id)!;
  }

  get(id: string): AgentLink | null {
    const row = this.db
      .prepare("SELECT * FROM agent_links WHERE id = ?")
      .get(id) as AgentLinkRow | undefined;
    return row ? rowToLink(row) : null;
  }

  listByAgent(agentWorkspaceId: string): AgentLink[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM agent_links WHERE agent_workspace_id = ? ORDER BY created_at ASC, rowid ASC",
      )
      .all(agentWorkspaceId) as AgentLinkRow[];
    return rows.map(rowToLink);
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM agent_links WHERE id = ?").run(id);
  }
}
