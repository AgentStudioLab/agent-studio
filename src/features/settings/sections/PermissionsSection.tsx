import { useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox";
import { useAllowedTools } from "@/lib/agui/react/useAllowedTools";
import { useDefaultAllowedTools } from "@/lib/data/thread-tools-queries";

const ALL_TOOLS = [
  "Bash",
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "WebFetch",
  "WebSearch",
  "Task",
] as const;

export function PermissionsSection() {
  const { t } = useTranslation();
  const { allowedTools, addAllowedTool, removeAllowedTool } = useAllowedTools();
  const { tools: defaultTools, setTools: setDefaults } = useDefaultAllowedTools();

  const toggleGlobalHitl = (tool: string) => {
    if (allowedTools.has(tool)) removeAllowedTool(tool);
    else addAllowedTool(tool);
  };

  const toggleDefault = (tool: string) => {
    const next = defaultTools.includes(tool)
      ? defaultTools.filter((x) => x !== tool)
      : [...defaultTools, tool];
    setDefaults(next);
  };

  return (
    <>
      <section className="space-y-3">
        <div>
          <h2 className="text-[18px] font-semibold text-foreground">
            {t("settings.hitl.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("settings.hitl.description")}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          {ALL_TOOLS.map((tool) => (
            <label
              key={tool}
              className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
            >
              <Checkbox
                checked={allowedTools.has(tool)}
                onCheckedChange={() => toggleGlobalHitl(tool)}
              />
              <span>{t(`settings.defaultTools.toolName.${tool}` as never)}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-3 border-t border-border pt-8">
        <div>
          <h2 className="text-[18px] font-semibold text-foreground">
            {t("settings.defaultTools.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("settings.defaultTools.description")}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          {ALL_TOOLS.map((tool) => (
            <label
              key={tool}
              className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
            >
              <Checkbox
                checked={defaultTools.includes(tool)}
                onCheckedChange={() => toggleDefault(tool)}
              />
              <span>{t(`settings.defaultTools.toolName.${tool}` as never)}</span>
            </label>
          ))}
        </div>
      </section>
    </>
  );
}
