import { ChevronLeft } from "lucide-react";
import { useAppShell } from "@/lib/AppShellContext";
import { ProfileForm } from "@/features/settings/ProfileForm";
import { ThemeSegment } from "@/features/_atoms/ThemeSegment";
import { cn } from "@/lib/utils";

export function SettingsView() {
  const { setView } = useAppShell();
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
        <h1 className="text-sm font-medium text-foreground">Settings</h1>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav className="flex w-[240px] shrink-0 flex-col gap-1 border-r border-border bg-sidebar px-3 py-4">
          <button
            type="button"
            className={cn(
              "rounded-md px-3 py-1.5 text-left text-sm bg-sidebar-accent text-foreground",
            )}
          >
            General
          </button>
        </nav>
        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-background px-8 py-8">
          <div className="flex max-w-2xl flex-col gap-10">
            <section>
              <h2 className="mb-6 font-serif text-2xl font-semibold text-foreground">
                Profile
              </h2>
              <ProfileForm />
            </section>
            <section className="border-t border-border pt-8">
              <h2 className="mb-4 font-serif text-2xl font-semibold text-foreground">
                Appearance
              </h2>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-foreground">
                  Theme
                </label>
                <ThemeSegment />
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
