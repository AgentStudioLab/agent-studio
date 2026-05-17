import { AppShell } from "@/layouts/AppShell";

export function ProjectsView() {
  return (
    <AppShell
      main={
        <div className="flex h-full items-center justify-center p-8">
          <div className="text-center">
            <h1 className="font-serif text-3xl font-semibold text-foreground">Projects</h1>
            <p className="mt-2 text-sm text-muted-foreground">Placeholder — view implementation in Wave 4 Task 5.</p>
          </div>
        </div>
      }
    />
  );
}
