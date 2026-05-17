import { useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { InitialsAvatar } from "@/features/_atoms/InitialsAvatar";

const WORK_OPTIONS = [
  { value: "engineer", label: "Software engineer" },
  { value: "designer", label: "Designer" },
  { value: "pm", label: "Product manager" },
  { value: "researcher", label: "Researcher" },
  { value: "writer", label: "Writer" },
  { value: "operations", label: "Operations / Business" },
  { value: "other", label: "Other" },
];

export function ProfileForm() {
  const [fullName, setFullName] = useState("Jay Yang");
  const [callMe, setCallMe] = useState("Jay");
  const [work, setWork] = useState("engineer");
  const [instructions, setInstructions] = useState("");

  return (
    <div className="flex flex-col gap-6">
      <section className="flex items-start justify-between gap-8">
        <div className="flex flex-1 flex-col gap-5">
          <FormField label="Full name">
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </FormField>
          <FormField label="What should Agent Studio call you?">
            <Input
              value={callMe}
              onChange={(e) => setCallMe(e.target.value)}
              placeholder="Jay"
            />
          </FormField>
          <FormField label="What best describes your work?">
            <Select value={work} onValueChange={setWork}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WORK_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>
        <InitialsAvatar initials="JY" hue="orange" size={56} />
      </section>

      <FormField
        label="Instructions for Agent Studio"
        hint={
          <>
            Agent Studio will keep these in mind across chats and Cowork within
            Anthropic's guidelines.{" "}
            <a href="#" className="underline hover:text-foreground">
              Learn more
            </a>
          </>
        }
      >
        <Textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={4}
          placeholder="e.g. ask clarifying questions before giving detailed answers"
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
