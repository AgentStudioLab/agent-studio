import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { SkillCard } from "@/features/customize/SkillCard";
import { SkillFileTree } from "@/features/customize/skill-files/SkillFileTree";
import { SkillFilePreview } from "@/features/customize/skill-files/SkillFilePreview";
import { useSkills, type SkillView } from "@/lib/agui/react/useSkills";

/** Hash a skill name → stable hue for InitialsAvatar coloring. Mirrors the
 *  vibe of the old mock palette without making us list every skill upfront. */
function hueFor(name: string): "orange" | "blue" | "green" | "purple" {
  const palette = ["orange", "blue", "green", "purple"] as const;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length]!;
}

function initialsFor(name: string): string {
  const parts = name.split(/[\s\-_:]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  const first = parts[0] ?? name;
  return first.slice(0, 2).toUpperCase();
}

export function SkillsBody() {
  const { t } = useTranslation();
  const { skills, isLoading, error, setEnabled } = useSkills();
  const [searchParams] = useSearchParams();

  const personal = useMemo(() => skills.filter((s) => s.source === "personal"), [skills]);
  const builtin = useMemo(() => skills.filter((s) => s.source === "builtin"), [skills]);

  // `?skill=<id>` deep-links from elsewhere (Context Tab → here) seed the
  // initial selection. Once mounted, local state takes over so in-pane card
  // clicks don't churn the URL.
  const [activeSkillId, setActiveSkillId] = useState<string | undefined>(
    () => searchParams.get("skill") ?? undefined,
  );
  // Selected file within the active personal skill — null = show the skill
  // description in the right pane (default). Reset whenever the user picks
  // a different skill so a half-open file from skill A doesn't bleed into
  // skill B's view.
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const selectSkill = (id: string) => {
    setActiveSkillId(id);
    setActiveFilePath(null);
  };
  // Pick a default selection: first personal, else first builtin.
  const effectiveActiveId =
    activeSkillId ?? personal[0]?.id ?? builtin[0]?.id;
  const activeSkill = skills.find((s) => s.id === effectiveActiveId);
  const showFileTree =
    activeSkill?.source === "personal" && activeSkill.id === effectiveActiveId;

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("customize.skills.loading")}
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-destructive-foreground">
        {error.message}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1">
      <aside className="flex w-[340px] shrink-0 flex-col overflow-y-auto border-r border-border bg-background px-3 py-4">
        {personal.length > 0 && (
          <>
            <h3 className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("customize.skills.personal")}
            </h3>
            <div className="flex flex-col gap-1">
              {personal.map((skill) => {
                const isActive = skill.id === effectiveActiveId;
                return (
                  <div key={skill.id} className="flex flex-col">
                    <SkillCard
                      initials={initialsFor(skill.name)}
                      hue={hueFor(skill.name)}
                      name={skill.name}
                      description={skill.description}
                      active={isActive}
                      onClick={() => selectSkill(skill.id)}
                    />
                    {isActive && showFileTree && (
                      <div className="ml-2 mt-1 border-l border-border pl-1">
                        <SkillFileTree
                          skillId={skill.id}
                          selectedPath={activeFilePath ?? undefined}
                          onSelect={setActiveFilePath}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
        {builtin.length > 0 && (
          <>
            <h3
              className={
                personal.length > 0
                  ? "mb-2 mt-6 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  : "mb-2 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
              }
            >
              {t("customize.skills.builtIn")}
            </h3>
            <div className="flex flex-col gap-1">
              {builtin.map((skill) => (
                <SkillCard
                  key={skill.id}
                  initials={initialsFor(skill.name)}
                  hue={hueFor(skill.name)}
                  name={skill.name}
                  description={skill.description}
                  active={skill.id === effectiveActiveId}
                  onClick={() => selectSkill(skill.id)}
                />
              ))}
            </div>
          </>
        )}
        {personal.length === 0 && builtin.length === 0 && (
          <div className="px-2 py-8 text-sm text-muted-foreground">
            {t("customize.skills.empty")}
          </div>
        )}
      </aside>
      <section className="flex min-h-0 flex-1 flex-col">
        {activeSkill && activeFilePath ? (
          <SkillFilePreview skillId={activeSkill.id} relPath={activeFilePath} />
        ) : activeSkill ? (
          <div className="flex-1 overflow-y-auto px-8 py-6">
            <SkillDetail
              skill={activeSkill}
              onToggle={(v) => setEnabled(activeSkill.id, v)}
            />
          </div>
        ) : (
          <div className="px-8 py-6 text-sm text-muted-foreground">
            {t("customize.skills.empty")}
          </div>
        )}
      </section>
    </div>
  );
}

interface SkillDetailProps {
  skill: SkillView;
  onToggle: (v: boolean) => void;
}

function SkillDetail({ skill, onToggle }: SkillDetailProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-[22px] font-semibold text-foreground">{skill.name}</h1>
        <div className="flex items-center gap-2">
          <Switch
            checked={skill.enabled}
            onCheckedChange={onToggle}
            aria-label={t("customize.skills.enabled")}
          />
          <button
            type="button"
            className="rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t("customize.skills.more")}
          >
            ⋮
          </button>
        </div>
      </div>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{t("customize.skills.addedBy")}</dt>
        <dd className="text-foreground">
          {skill.source === "builtin"
            ? t("customize.skills.addedByBuiltin")
            : t("customize.skills.addedByYou")}
        </dd>
        <dt className="text-muted-foreground">{t("customize.skills.trigger")}</dt>
        <dd className="text-foreground">{t("customize.skills.triggerValue")}</dd>
        {skill.source === "personal" && (
          <>
            <dt className="text-muted-foreground">{t("customize.skills.location")}</dt>
            <dd className="font-mono text-[12px] text-muted-foreground">
              {skill.sourcePath}
            </dd>
          </>
        )}
      </dl>
      <p className="text-sm leading-[1.65] text-foreground">
        {skill.description}
      </p>
    </div>
  );
}
