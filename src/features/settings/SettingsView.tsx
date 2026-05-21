import { useState } from "react";
import { ChevronLeft, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAppShell } from "@/app/AppShellContext";
import { ProfileForm } from "@/features/settings/ProfileForm";
import { ThemeSegment } from "@/shared/atoms/ThemeSegment";
import { LanguageSegment } from "@/shared/atoms/LanguageSegment";
import { cn } from "@/lib/utils";
import { setApiKey } from "@/lib/data/settings";
import { useAllowedTools } from "@/lib/agui/react/useAllowedTools";

export function SettingsView() {
  const { setView } = useAppShell();
  const { t } = useTranslation();

  const [apiKeyInput, setApiKeyInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<"saved" | "error" | null>(null);
  const { allowedTools, removeAllowedTool } = useAllowedTools();

  const handleSaveApiKey = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      await setApiKey(apiKeyInput.trim());
      setSaveMsg("saved");
      setApiKeyInput("");
    } catch {
      setSaveMsg("error");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={() => setView("task")}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={t("settings.back")}
        >
          <ChevronLeft className="size-4" />
        </button>
        <h1 className="text-sm font-medium text-foreground">
          {t("settings.title")}
        </h1>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav className="flex w-[240px] shrink-0 flex-col gap-1 border-r border-border bg-sidebar px-3 py-4">
          <button
            type="button"
            className={cn(
              "rounded-md bg-sidebar-accent px-3 py-1.5 text-left text-sm text-foreground",
            )}
          >
            {t("settings.nav.general")}
          </button>
        </nav>
        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-background px-8 py-8">
          <div className="flex max-w-2xl flex-col gap-10">
            <section>
              <h2 className="mb-6 text-[18px] font-semibold text-foreground">
                {t("settings.profile.title")}
              </h2>
              <ProfileForm />
            </section>
            <section className="border-t border-border pt-8 space-y-3">
              <div>
                <h2 className="text-[18px] font-semibold text-foreground">
                  {t("settings.apiKey.title")}
                </h2>
                <p className="text-sm text-muted-foreground">{t("settings.apiKey.description")}</p>
              </div>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={t("settings.apiKey.placeholder")}
                  className="flex-1 rounded-md border border-border bg-bg-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
                <button
                  type="button"
                  onClick={handleSaveApiKey}
                  disabled={saving || apiKeyInput.length === 0}
                  className="rounded-md px-4 py-2 text-sm hover:opacity-90 disabled:opacity-50"
                  style={{ background: "hsl(var(--text-100))", color: "hsl(var(--bg-100))" }}
                >
                  {t("settings.apiKey.save")}
                </button>
              </div>
              {saveMsg === "saved" && (
                <p className="text-sm" style={{ color: "hsl(var(--text-300))" }}>
                  {t("settings.apiKey.saved")}
                </p>
              )}
              {saveMsg === "error" && (
                <p className="text-sm" style={{ color: "hsl(var(--danger-100))" }}>
                  {t("settings.apiKey.saveError")}
                </p>
              )}
            </section>
            <section className="border-t border-border pt-8 space-y-3">
              <div>
                <h2 className="text-[18px] font-semibold text-foreground">
                  {t("settings.hitl.title")}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t("settings.hitl.description")}
                </p>
              </div>
              {allowedTools.size === 0 ? (
                <p
                  className="text-sm"
                  style={{ color: "hsl(var(--text-300))" }}
                >
                  {t("settings.hitl.empty")}
                </p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {[...allowedTools].map((name) => (
                    <li
                      key={name}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-200 px-2.5 py-1 text-[13px]"
                    >
                      <code className="text-foreground">{name}</code>
                      <button
                        type="button"
                        onClick={() => removeAllowedTool(name)}
                        aria-label={t("settings.hitl.remove")}
                        className="rounded p-0.5 hover:bg-muted"
                        style={{ color: "hsl(var(--text-300))" }}
                      >
                        <X size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="border-t border-border pt-8">
              <h2 className="mb-4 text-[18px] font-semibold text-foreground">
                {t("settings.appearance.title")}
              </h2>
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-foreground">
                    {t("settings.appearance.theme")}
                  </label>
                  <ThemeSegment />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-foreground">
                    {t("settings.appearance.language")}
                  </label>
                  <LanguageSegment />
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
