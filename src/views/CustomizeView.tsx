import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { useAppShell } from "@/lib/AppShellContext";
import {
  CustomizeNav,
  type CustomizeNavSection,
} from "@/features/customize/CustomizeNav";
import {
  CustomizeHome,
  type CustomizeHomeAction,
} from "@/features/customize/CustomizeHome";
import { SkillsBody } from "@/features/customize/SkillsBody";

interface CustomizeViewProps {
  initialSection?: CustomizeNavSection;
}

export function CustomizeView({ initialSection = "home" }: CustomizeViewProps) {
  const { setView } = useAppShell();
  const [section, setSection] = useState<CustomizeNavSection>(initialSection);

  const handleHomeAction = (action: CustomizeHomeAction) => {
    if (action === "skills") setSection("skills");
    else if (action === "plugins") setSection("plugins");
    // "connect" has no destination yet
  };

  return (
    <div className="flex h-screen w-screen flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={() => setView("task")}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Back"
        >
          <ChevronLeft className="size-4" />
        </button>
        <h1 className="text-sm font-medium text-foreground">Customize</h1>
      </header>
      <div className="flex min-h-0 flex-1">
        <CustomizeNav active={section} onChange={setSection} />
        <main className="flex min-w-0 flex-1 flex-col bg-background">
          {section === "home" && (
            <CustomizeHome onSelectAction={handleHomeAction} />
          )}
          {section === "skills" && <SkillsBody />}
          {section === "agents" && (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Agents subview coming in Task 11.
            </div>
          )}
          {section === "plugins" && (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Plugins marketplace coming in Task 12.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
