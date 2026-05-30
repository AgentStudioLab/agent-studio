import type { Database } from "bun:sqlite";
import { nanoid } from "nanoid";

export interface AgentFolder {
  id: string;
  agentWorkspaceId: string;
  /** Absolute path to the external folder on disk. */
  path: string;
  /** Display name (defaults to the path basename when the caller omits it). */
  folderName: string;
  /** false = read-only (default), true = the agent may write here. */
  writable: boolean;
  createdAt: number;
}

interface AgentFolderRow {
  id: string;
  agent_workspace_id: string;
  path: string;
  folder_name: string;
  writable: number;
  created_at: number;
}

function rowToFolder(r: AgentFolderRow): AgentFolder {
  return {
    id: r.id,
    agentWorkspaceId: r.agent_workspace_id,
    path: r.path,
    folderName: r.folder_name,
    writable: r.writable === 1,
    createdAt: r.created_at,
  };
}

export interface CreateAgentFolderInput {
  agentWorkspaceId: string;
  path: string;
  folderName: string;
  writable?: boolean;
}

/**
 * External folders mounted into an agent workspace as extra context. Default
 * read-only; each folder can be granted write. The runWorker resolves a thread's
 * agent → its folders to compute the SDK sandbox read/write roots.
 */
export class AgentFolderService {
  constructor(private db: Database) {}

  create(input: CreateAgentFolderInput): AgentFolder {
    const id = `agf_${nanoid(12)}`;
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO agent_folders (id, agent_workspace_id, path, folder_name, writable, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.agentWorkspaceId, input.path, input.folderName, input.writable ? 1 : 0, now);
    return this.get(id)!;
  }

  get(id: string): AgentFolder | null {
    const row = this.db
      .prepare("SELECT * FROM agent_folders WHERE id = ?")
      .get(id) as AgentFolderRow | undefined;
    return row ? rowToFolder(row) : null;
  }

  listByAgent(agentWorkspaceId: string): AgentFolder[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM agent_folders WHERE agent_workspace_id = ? ORDER BY created_at ASC, rowid ASC",
      )
      .all(agentWorkspaceId) as AgentFolderRow[];
    return rows.map(rowToFolder);
  }

  setWritable(id: string, writable: boolean): AgentFolder | null {
    if (!this.get(id)) return null;
    this.db
      .prepare("UPDATE agent_folders SET writable = ? WHERE id = ?")
      .run(writable ? 1 : 0, id);
    return this.get(id);
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM agent_folders WHERE id = ?").run(id);
  }
}
