import { useMemo, useState } from "react";
import { Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/switch";
import { SkillCard } from "@/features/customize/SkillCard";
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

  const personal = useMemo(() => skills.filter((s) => s.source === "personal"), [skills]);
  const builtin = useMemo(() => skills.filter((s) => s.source === "builtin"), [skills]);

  const [activeSkillId, setActiveSkillId] = useState<string | undefined>(undefined);
  // Pick a default selection: first personal, else first builtin.
  const effectiveActiveId =
    activeSkillId ?? personal[0]?.id ?? builtin[0]?.id;
  const activeSkill = skills.find((s) => s.id === effectiveActiveId);

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
              {personal.map((skill) => (
                <SkillCard
                  key={skill.id}
                  initials={initialsFor(skill.name)}
                  hue={hueFor(skill.name)}
                  name={skill.name}
                  description={skill.description}
                  sourcePath={skill.sourcePath}
                  active={skill.id === effectiveActiveId}
                  onClick={() => setActiveSkillId(skill.id)}
                />
              ))}
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
                  onClick={() => setActiveSkillId(skill.id)}
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
      <section className="flex flex-1 flex-col overflow-y-auto px-8 py-6">
        {activeSkill ? (
          <SkillDetail
            skill={activeSkill}
            onToggle={(v) => setEnabled(activeSkill.id, v)}
          />
        ) : (
          <div className="text-sm text-muted-foreground">
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
      <div className="flex items-start gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>{skill.description}</span>
      </div>
      <article className="flex flex-col gap-3 text-sm">
        <h2 className="font-serif text-[22px] font-normal text-foreground">
          {t("customize.skills.howItWorks")}
        </h2>
        <ul className="ml-4 list-disc text-foreground">
          <li>{skill.description}</li>
          <li>{t("customize.skills.bullets.autoTrigger")}</li>
          <li>{t("customize.skills.bullets.tagged")}</li>
        </ul>
      </article>
    </div>
  );
}
