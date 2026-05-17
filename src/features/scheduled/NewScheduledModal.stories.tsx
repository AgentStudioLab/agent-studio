import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { NewScheduledModal } from "@/features/scheduled/NewScheduledModal";
import { Button } from "@/components/ui/button";

const meta: Meta<typeof NewScheduledModal> = {
  title: "Features/Scheduled/NewScheduledModal",
  component: NewScheduledModal,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof NewScheduledModal>;

export const Open: Story = {
  render: () => {
    const [open, setOpen] = useState(true);
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Button onClick={() => setOpen(true)}>Open modal</Button>
        <NewScheduledModal open={open} onOpenChange={setOpen} onSave={(d) => console.log("save", d)} />
      </div>
    );
  },
};

export const SideBySide: Story = {
  render: () => {
    const [openA, setOpenA] = useState(true);
    const [openB, setOpenB] = useState(true);
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: "100vh" }}>
        <div style={{ background: "hsl(var(--bg-100))" }}>
          <NewScheduledModal open={openA} onOpenChange={setOpenA} onSave={(d) => console.log("save light", d)} />
        </div>
        <div data-mode="dark" style={{ background: "hsl(var(--bg-100))" }}>
          <NewScheduledModal open={openB} onOpenChange={setOpenB} onSave={(d) => console.log("save dark", d)} />
        </div>
      </div>
    );
  },
};
