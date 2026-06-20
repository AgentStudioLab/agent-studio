import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useSkills } from "@/lib/agui/react/useSkills";
import { useUpdateAgentWorkspaceMutation } from "@/lib/data/agent-queries";

/**
 * 管理某个智能体挂载哪些技能的弹窗。
 *
 * 三态保存策略（呼应设计决策）：勾全部 → 存 null（继承全部，日后新增技能自动可见）；
 * 勾子集 → 存该数组；全不勾 → 存空数组（显式不挂）。运行时再与全局启用集取交集，
 * 所以这里即便勾上"已全局关闭"的技能也不会真正生效（仅作提示）。
 */
export function ManageSkillsModal({
  agentId,
  current,
  open,
  onOpenChange,
}: {
  agentId: string;
  current: string[] | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { skills, isLoading } = useSkills();
  const update = useUpdateAgentWorkspaceMutation();

  // 本地勾选集。打开时按当前挂载选择初始化：null（继承）→ 全选；数组 → 该集合。
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!open) return;
    setSelected(current === null ? new Set(skills.map((s) => s.id)) : new Set(current));
  }, [open, current, skills]);

  const allIds = useMemo(() => skills.map((s) => s.id), [skills]);
  const allChecked = allIds.length > 0 && allIds.every((id) => selected.has(id));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = () => {
    // 全选 → null（继承全部）；否则存勾选数组（含空数组=显式不挂）。
    const mountedSkills = allChecked ? null : Array.from(selected);
    update.mutate(
      { id: agentId, patch: { mountedSkills } },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 rounded-2xl p-7 sm:max-w-[480px]">
        <DialogHeader className="mb-2">
          <DialogTitle className="font-sans text-[19px] font-semibold text-text-100">
            {t("agentSpace.skills.manageTitle")}
          </DialogTitle>
        </DialogHeader>
        <p className="mb-4 text-[13px] leading-relaxed text-text-300">
          {t("agentSpace.skills.manageDescription")}
        </p>

        <button
          type="button"
          onClick={() => setSelected(allChecked ? new Set() : new Set(allIds))}
          className="mb-2 self-start text-[13px] text-accent-100 outline-hidden hover:underline"
        >
          {allChecked
            ? t("agentSpace.skills.deselectAll")
            : t("agentSpace.skills.selectAll")}
        </button>

        <div className="max-h-[320px] overflow-y-auto rounded-lg border border-border-300/15">
          {isLoading ? (
            <p className="px-3 py-4 text-[13px] text-text-400">
              {t("agentSpace.skills.loading")}
            </p>
          ) : skills.length === 0 ? (
            <p className="px-3 py-4 text-[13px] text-text-400">
              {t("agentSpace.skills.empty")}
            </p>
          ) : (
            <ul className="flex flex-col">
              {skills.map((s) => (
                <li key={s.id}>
                  {/* 整行可点：Checkbox 仅作展示（pointer-events-none），由按钮统一处理点击，
                      避免 label+Radix 双触发。 */}
                  <button
                    type="button"
                    onClick={() => toggle(s.id)}
                    className="flex w-full items-start gap-3 px-3 py-2.5 text-left outline-hidden hover:bg-bg-200"
                  >
                    <Checkbox
                      checked={selected.has(s.id)}
                      tabIndex={-1}
                      className="pointer-events-none mt-0.5"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[14px] text-text-100">
                          {s.name}
                        </span>
                        {!s.enabled && (
                          <span className="shrink-0 text-[11px] text-text-400">
                            {t("agentSpace.skills.globallyOff")}
                          </span>
                        )}
                      </span>
                      {s.description && (
                        <span className="mt-0.5 block truncate text-[12px] text-text-400">
                          {s.description}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md px-4 py-2 text-[13.5px] text-text-200 transition hover:bg-bg-200"
          >
            {t("agentSpace.skills.cancel")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={update.isPending}
            className="rounded-md bg-primary px-4 py-2 text-[13.5px] font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("agentSpace.skills.save")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
