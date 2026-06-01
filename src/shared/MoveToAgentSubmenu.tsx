import { Check, FolderInput } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { useAgentWorkspaces } from "@/lib/data/agent-queries";
import { useMoveConversationToAgentMutation } from "@/lib/data/queries";

/**
 * Conversation context-menu submenu: "Move to agent space" → lists the agent
 * workspaces; selecting one binds the conversation to that agent (its working
 * dir, memory, and folders follow). Self-contained (own data + mutation) so it
 * drops into any DropdownMenuContent. Renders nothing when there are no agents.
 */
export function MoveToAgentSubmenu({
  conversationId,
  currentAgentWorkspaceId,
  label,
}: {
  conversationId: string;
  currentAgentWorkspaceId?: string | null;
  label: string;
}) {
  const { data: agents } = useAgentWorkspaces();
  const move = useMoveConversationToAgentMutation();
  const list = agents ?? [];
  if (list.length === 0) return null;

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <FolderInput className="size-4" />
        {label}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {list.map((a) => (
          <DropdownMenuItem
            key={a.id}
            onSelect={() => move.mutate({ id: conversationId, agentWorkspaceId: a.id })}
          >
            {currentAgentWorkspaceId === a.id ? (
              <Check className="size-4" />
            ) : (
              <span className="size-4" />
            )}
            <span className="truncate">{a.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
