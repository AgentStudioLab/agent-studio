import { AppShellProvider } from "@/app/AppShellContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MacTitlebar } from "@/app/MacTitlebar";
import { RouterView } from "@/app/RouterView";

function App() {
  return (
    <AppShellProvider>
      <TooltipProvider delayDuration={200}>
        <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
          <MacTitlebar />
          <div className="flex min-h-0 flex-1">
            <RouterView />
          </div>
        </div>
      </TooltipProvider>
    </AppShellProvider>
  );
}

export default App;
