import { Check, FolderInput, FolderOutput } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
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
 * drops into any DropdownMenuContent.
 *
 * 当会话已绑定某个智能体（currentAgentWorkspaceId 非空）且提供了 moveOutLabel 时，
 * 列表底部追加一个「移出智能体空间」项：解绑（agentWorkspaceId=null），working_dir
 * 退回默认工作区（后端 PATCH /conversations/:id 已处理）。
 *
 * Renders nothing when there are no agents AND there's nothing to move out of.
 */
export function MoveToAgentSubmenu({
  conversationId,
  currentAgentWorkspaceId,
  label,
  moveOutLabel,
}: {
  conversationId: string;
  currentAgentWorkspaceId?: string | null;
  label: string;
  /** 已在智能体空间时显示的「移出」文案；不传则不显示移出项。 */
  moveOutLabel?: string;
}) {
  const { data: agents } = useAgentWorkspaces();
  const move = useMoveConversationToAgentMutation();
  const list = agents ?? [];
  const canMoveOut = Boolean(currentAgentWorkspaceId && moveOutLabel);
  if (list.length === 0 && !canMoveOut) return null;

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
        {canMoveOut && (
          <>
            {list.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem
              onSelect={() =>
                move.mutate({ id: conversationId, agentWorkspaceId: null })
              }
            >
              <FolderOutput className="size-4" />
              <span className="truncate">{moveOutLabel}</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
