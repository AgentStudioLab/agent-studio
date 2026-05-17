import { AppShell } from "@/layouts/AppShell";

export function NewTaskView() {
  return (
    <AppShell
      main={
        <div className="flex h-full items-center justify-center p-8">
          <div className="text-center">
            <h1 className="font-serif text-3xl font-semibold text-foreground">New task</h1>
            <p className="mt-2 text-sm text-muted-foreground">Placeholder — view implementation in Wave 4 Task 4.</p>
          </div>
        </div>
      }
    />
  );
}
