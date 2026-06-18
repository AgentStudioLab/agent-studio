import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SlidersHorizontal } from "lucide-react";
import { useAgentWorkspace } from "@/lib/data/agent-queries";
import { useSkills } from "@/lib/agui/react/useSkills";
import { RailSection } from "./RailSection";
import { ManageSkillsModal } from "./ManageSkillsModal";

/**
 * 技能挂载卡片：这个智能体挂载哪些技能。
 *   null   → 全部技能（继承全局启用集，日后新增自动可见）
 *   []     → 显式不挂任何技能
 *   [...]  → 显式子集
 * 运行时与全局启用集取交集。右上角按钮打开管理弹窗。
 */
export function SkillsRailCard({ agentId }: { agentId: string }) {
  const { t } = useTranslation();
  const { data: agent } = useAgentWorkspace(agentId);
  const { skills } = useSkills();
  const [open, setOpen] = useState(false);

  const mounted = agent?.mountedSkills ?? null;
  // 内置(官方只读)：挂载技能属于定义，来自仓库内 JSON，不提供管理入口。
  const readOnly = agent?.source === "builtin";

  // id → name 映射；已卸载/未知 id 原样显示。
  const mountedNames = useMemo(() => {
    if (mounted == null) return [];
    const byId = new Map(skills.map((s) => [s.id, s.name]));
    return mounted.map((id) => byId.get(id) ?? id);
  }, [mounted, skills]);

  const manageAction = (
    <button
      type="button"
      aria-label={t("agentSpace.skills.manage")}
      onClick={() => setOpen(true)}
      className="shrink-0 rounded-md p-1 text-muted-foreground outline-hidden hover:bg-state-hover hover:text-foreground"
    >
      <SlidersHorizontal className="size-4" />
    </button>
  );

  return (
    <>
      <RailSection
        title={t("agentSpace.skills.title")}
        action={readOnly ? undefined : manageAction}
      >
        {mounted == null ? (
          <p className="py-0.5 text-sm text-muted-foreground">
            {t("agentSpace.skills.allMounted")}
          </p>
        ) : mounted.length === 0 ? (
          <p className="py-0.5 text-sm text-muted-foreground">
            {t("agentSpace.skills.noneMounted")}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {mountedNames.map((name, i) => (
              <li
                key={mounted[i]}
                className="truncate rounded-md px-2 py-1 text-sm text-foreground"
              >
                {name}
              </li>
            ))}
          </ul>
        )}
      </RailSection>
      {agent && !readOnly && (
        <ManageSkillsModal
          agentId={agentId}
          current={mounted}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </>
  );
}
