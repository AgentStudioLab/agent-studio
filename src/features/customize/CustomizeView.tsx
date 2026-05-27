import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  CustomizeNav,
  type CustomizeNavSection,
} from "@/features/customize/CustomizeNav";
import {
  CustomizeHome,
  type CustomizeHomeAction,
} from "@/features/customize/CustomizeHome";
import { SkillsBody } from "@/features/customize/SkillsBody";
import { AgentsBody } from "@/features/customize/AgentsBody";
import { PluginsBody } from "@/features/customize/PluginsBody";

interface CustomizeViewProps {
  initialSection?: CustomizeNavSection;
}

const SECTION_VALUES = ["home", "skills", "agents", "plugins"] as const;

function parseSection(raw: string | null): CustomizeNavSection | null {
  return SECTION_VALUES.includes(raw as CustomizeNavSection)
    ? (raw as CustomizeNavSection)
    : null;
}

/**
 * Validate a `?from` return path. Must be a relative same-origin URL so a
 * malicious link can't redirect the user off the app. Anything not starting
 * with a single "/" is rejected and the back button falls back to "/".
 */
function safeReturnPath(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

export function CustomizeView({ initialSection = "home" }: CustomizeViewProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const sectionFromUrl = parseSection(searchParams.get("section"));
  const returnPath = safeReturnPath(searchParams.get("from"));
  const [section, setSection] = useState<CustomizeNavSection>(
    sectionFromUrl ?? initialSection,
  );

  const handleHomeAction = (action: CustomizeHomeAction) => {
    if (action === "skills") setSection("skills");
    else if (action === "plugins") setSection("plugins");
    // "connect" has no destination yet
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      {/* `pl-20` reserves the 80px macOS traffic-light slot — this is a
       *  hideSidebar route, so there's no sidebar segment to claim that
       *  zone in the MacTitlebar overlay. */}
      <header className="flex items-center gap-3 border-b border-border pl-20 pr-4 py-3">
        <button
          type="button"
          onClick={() => navigate(returnPath ?? "/")}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={t("customize.back")}
        >
          <ChevronLeft className="size-4" />
        </button>
        <h1 className="text-sm font-medium text-foreground">
          {t("customize.title")}
        </h1>
      </header>
      <div className="flex min-h-0 flex-1">
        <CustomizeNav active={section} onChange={setSection} />
        <main className="flex min-w-0 flex-1 flex-col bg-background">
          {section === "home" && (
            <CustomizeHome onSelectAction={handleHomeAction} />
          )}
          {section === "skills" && <SkillsBody />}
          {section === "agents" && <AgentsBody />}
          {section === "plugins" && <PluginsBody />}
        </main>
      </div>
    </div>
  );
}
