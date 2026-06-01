import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

/**
 * Right-rail collapsible card shell: a titled header row (title left; optional
 * `action` button + chevron right) over collapsible content. Title and chevron
 * both toggle; `action` (e.g. a ＋ dropdown or pencil) stays independent.
 */
export function RailSection({
  title,
  action,
  defaultOpen = true,
  children,
}: {
  title: ReactNode;
  action?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className="group/rail rounded-2xl border border-border bg-card"
    >
      <div className="flex items-center gap-1 px-4 py-3">
        <CollapsibleTrigger className="flex min-w-0 flex-1 items-center text-left text-sm font-medium text-foreground outline-hidden">
          <span className="truncate">{title}</span>
        </CollapsibleTrigger>
        {action}
        <CollapsibleTrigger
          aria-label="toggle"
          className="shrink-0 rounded-md p-1 text-muted-foreground outline-hidden hover:bg-state-hover hover:text-foreground"
        >
          <ChevronDown className="size-4 transition-transform group-data-[state=open]/rail:rotate-180" />
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="px-4 pb-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}
