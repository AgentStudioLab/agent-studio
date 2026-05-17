import { AppShellProvider } from "@/lib/AppShellContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RouterView } from "@/views";

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
