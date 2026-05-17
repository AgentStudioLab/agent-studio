import { useState } from "react";
import { Info } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { SkillCard } from "@/features/customize/SkillCard";
import { loadedSkills } from "@/lib/mock/skills";
import type { MockSkill } from "@/lib/mock/types";

// Mock files surfaced when the active skill is expanded.
const SKILL_CREATOR_FILES = [
  "SKILL.md",
  "agents/",
  "assets/",
  "eval-viewer/",
  "references/",
  "scripts/",
  "LICENSE.txt",
];

const PERSONAL_SKILLS = loadedSkills.slice(0, 2);
const BUILTIN_SKILLS = loadedSkills.slice(2);

export function SkillsBody() {
  const [activeSkillId, setActiveSkillId] = useState<string | undefined>(
    loadedSkills[0]?.id,
  );
  const [enabled, setEnabled] = useState(true);
  const activeSkill = loadedSkills.find((s) => s.id === activeSkillId);

  return (
    <div className="flex h-full min-h-0 flex-1">
      <aside className="flex w-[340px] shrink-0 flex-col overflow-y-auto border-r border-border bg-background px-3 py-4">
        <h3 className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Personal skills
        </h3>
        <div className="flex flex-col gap-1">
          {PERSONAL_SKILLS.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              active={skill.id === activeSkillId}
              expanded={skill.id === activeSkillId}
              onClick={() => setActiveSkillId(skill.id)}
              childFiles={
                skill.id === activeSkillId ? SKILL_CREATOR_FILES : undefined
              }
            />
          ))}
        </div>
        <h3 className="mb-2 mt-6 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Built-in skills
        </h3>
        <div className="flex flex-col gap-1">
          {BUILTIN_SKILLS.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              active={skill.id === activeSkillId}
              onClick={() => setActiveSkillId(skill.id)}
            />
          ))}
        </div>
      </aside>
      <section className="flex flex-1 flex-col overflow-y-auto px-8 py-6">
        {activeSkill ? (
          <SkillDetail
            skill={activeSkill}
            enabled={enabled}
            onToggle={setEnabled}
          />
        ) : (
          <div className="text-sm text-muted-foreground">
            Select a skill from the left.
          </div>
        )}
      </section>
    </div>
  );
}

interface SkillDetailProps {
  skill: MockSkill;
  enabled: boolean;
  onToggle: (v: boolean) => void;
}

function SkillDetail({ skill, enabled, onToggle }: SkillDetailProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <h1 className="font-serif text-3xl font-semibold text-foreground">
          {skill.name}
        </h1>
        <div className="flex items-center gap-2">
          <Switch
            checked={enabled}
            onCheckedChange={onToggle}
            aria-label="Enabled"
          />
          <button
            type="button"
            className="rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="More"
          >
            ⋮
          </button>
        </div>
      </div>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Added by</dt>
        <dd className="text-foreground">You</dd>
        <dt className="text-muted-foreground">Trigger</dt>
        <dd className="text-foreground">Manual + auto-suggest</dd>
      </dl>
      <div className="flex items-start gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>{skill.description}</span>
      </div>
      <article className="flex flex-col gap-3 text-sm">
        <h2 className="font-serif text-xl font-semibold text-foreground">
          How it works
        </h2>
        <ul className="ml-4 list-disc text-foreground">
          <li>{skill.description}</li>
          <li>Triggers automatically when relevant context is detected.</li>
          <li>Outputs are tagged with the skill name.</li>
        </ul>
      </article>
    </div>
  );
}
