import { AppShellProvider } from "@/app/AppShellContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RouterView } from "@/app/RouterView";

function App() {
  return (
    <AppShellProvider>
      <TooltipProvider delayDuration={200}>
        <RouterView />
      </TooltipProvider>
    </AppShellProvider>
  );
}

export default App;
