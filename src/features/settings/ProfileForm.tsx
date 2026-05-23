import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { getProfile, setProfile } from "@/lib/data/settings";

const WORK_KEYS = [
  "engineer",
  "designer",
  "pm",
  "researcher",
  "writer",
  "operations",
  "other",
] as const;
type WorkKey = (typeof WORK_KEYS)[number];

function isWorkKey(v: string): v is WorkKey {
  return (WORK_KEYS as readonly string[]).includes(v);
}

// Derive initials for the avatar. Empty callMe → "?" so the round badge
// stays visible while the user hasn't filled anything in yet.
function initialsFrom(callMe: string): string {
  const trimmed = callMe.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function ProfileForm() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
    staleTime: 60 * 1000,
  });

  // Local editable mirror, primed from server. Saves are debounced via
  // onBlur — typing every keystroke doesn't hit the network, but tab/click
  // away persists. The Select saves immediately on change (no blur event).
  const [callMe, setCallMe] = useState("");
  const [work, setWork] = useState<WorkKey>("engineer");
  const [instructions, setInstructions] = useState("");
  const [primed, setPrimed] = useState(false);

  useEffect(() => {
    if (!data || primed) return;
    setCallMe(data.callMe);
    setWork(isWorkKey(data.work) ? data.work : "engineer");
    setInstructions(data.instructions);
    setPrimed(true);
  }, [data, primed]);

  const save = async (patch: {
    callMe?: string;
    work?: string;
    instructions?: string;
  }) => {
    await setProfile(patch);
    void qc.invalidateQueries({ queryKey: ["profile"] });
  };

  if (isLoading || !primed) {
    return <p className="text-sm text-muted-foreground">…</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex items-start justify-between gap-8">
        <div className="flex flex-1 flex-col gap-5">
          <FormField label={t("settings.profile.callMe")}>
            <Input
              value={callMe}
              onChange={(e) => setCallMe(e.target.value)}
              onBlur={() => {
                if (callMe !== data?.callMe) void save({ callMe });
              }}
              placeholder={t("settings.profile.callMePlaceholder")}
            />
          </FormField>
          <FormField label={t("settings.profile.work")}>
            <Select
              value={work}
              onValueChange={(v) => {
                if (!isWorkKey(v)) return;
                setWork(v);
                void save({ work: v });
              }}
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
        <InitialsAvatar initials={initialsFrom(callMe)} hue="orange" size={56} />
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
          onBlur={() => {
            if (instructions !== data?.instructions) void save({ instructions });
          }}
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
