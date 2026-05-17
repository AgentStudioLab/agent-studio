import type { Meta, StoryObj } from "@storybook/react-vite";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProfileForm } from "@/features/settings/ProfileForm";

const meta: Meta<typeof ProfileForm> = {
  title: "Features/Settings/ProfileForm",
  component: ProfileForm,
  parameters: { layout: "centered" },
};
export default meta;
type Story = StoryObj<typeof ProfileForm>;

export const Default: Story = {
  render: () => (
    <TooltipProvider delayDuration={200}>
      <div className="w-[640px] bg-background p-6">
        <ProfileForm />
      </div>
    </TooltipProvider>
  ),
};

export const SideBySide: Story = {
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
      <div className="bg-background p-6">
        <TooltipProvider delayDuration={200}>
          <ProfileForm />
        </TooltipProvider>
      </div>
      <div data-mode="dark" className="bg-background p-6">
        <TooltipProvider delayDuration={200}>
          <ProfileForm />
        </TooltipProvider>
      </div>
    </div>
  ),
};
