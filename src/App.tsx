import { AppShellProvider } from "@/lib/AppShellContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TaskView } from "@/views/TaskView";

function App() {
  return (
    <AppShellProvider>
      <TooltipProvider delayDuration={200}>
        <TaskView />
      </TooltipProvider>
    </AppShellProvider>
  );
}

export default App;
