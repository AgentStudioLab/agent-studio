import { useTranslation } from "react-i18next";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { useSkills } from "@/lib/agui/react/useSkills";

/**
 * React node view for the `/skill` mention chip.
 *
 * The chip itself is the inner `<span>` (with `slash-skill-mention` styling
 * + `data-id`); wrapping it in `<NodeViewWrapper>` lets ProseMirror attach
 * its node-view bookkeeping (decorations, selection, etc.) without us
 * losing the inline-pill shape.
 *
 * We look up the description from the live skills list rather than
 * persisting it in node attrs — skill descriptions are mutable and the
 * source of truth lives on the sidecar. If the skill has been removed or
 * isn't loaded yet, we render the chip without a tooltip rather than
 * popping an empty box.
 */
export function SkillMentionView({ node }: NodeViewProps) {
  const { t } = useTranslation();
  const { skills } = useSkills();
  const id = (node.attrs.id as string | null) ?? null;
  const label = (node.attrs.label as string | null) ?? id ?? "";
  const skill = id ? skills.find((s) => s.id === id) : undefined;
  const description = skill?.description ?? "";

  if (!description) {
    return (
      <NodeViewWrapper as="span" className="slash-skill-mention-host">
        <span className="slash-skill-mention" data-id={id ?? undefined}>
          /{label}
        </span>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper as="span" className="slash-skill-mention-host">
      <HoverCard openDelay={200} closeDelay={120}>
        <HoverCardTrigger asChild>
          <span className="slash-skill-mention" data-id={id ?? undefined}>
            /{label}
          </span>
        </HoverCardTrigger>
        <HoverCardContent side="top" align="start" className="w-[260px]">
          <div className="text-[12.5px] leading-snug text-popover-foreground">
            {description}
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            {t("composer.slash.kindLabel")}
          </div>
        </HoverCardContent>
      </HoverCard>
    </NodeViewWrapper>
  );
}
