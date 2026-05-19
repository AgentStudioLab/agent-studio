import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { InitialsAvatar } from "@/shared/atoms/InitialsAvatar";

const WORK_KEYS = [
  "engineer",
  "designer",
  "pm",
  "researcher",
  "writer",
  "operations",
  "other",
] as const;

export function ProfileForm() {
  const { t } = useTranslation();
  const [fullName, setFullName] = useState("Jay Yang");
  const [callMe, setCallMe] = useState("Jay");
  const [work, setWork] = useState<(typeof WORK_KEYS)[number]>("engineer");
  const [instructions, setInstructions] = useState("");

  return (
    <div className="flex flex-col gap-6">
      <section className="flex items-start justify-between gap-8">
        <div className="flex flex-1 flex-col gap-5">
          <FormField label={t("settings.profile.fullName")}>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </FormField>
          <FormField label={t("settings.profile.callMe")}>
            <Input
              value={callMe}
              onChange={(e) => setCallMe(e.target.value)}
              placeholder={t("settings.profile.callMePlaceholder")}
            />
          </FormField>
          <FormField label={t("settings.profile.work")}>
            <Select
              value={work}
              onValueChange={(v) => setWork(v as (typeof WORK_KEYS)[number])}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WORK_KEYS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {t(`settings.profile.workOptions.${key}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>
        <InitialsAvatar initials="JY" hue="orange" size={56} />
      </section>

      <FormField
        label={t("settings.profile.instructions")}
        hint={
          <>
            {t("settings.profile.instructionsHint")}{" "}
            <a href="#" className="underline hover:text-foreground">
              {t("settings.profile.instructionsLearnMore")}
            </a>
          </>
        }
      >
        <Textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={4}
          placeholder={t("settings.profile.instructionsPlaceholder")}
        />
      </FormField>
    </div>
  );
}

function FormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      {children}
    </div>
  );
}
