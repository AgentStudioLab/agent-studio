import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  PluginCategoryChips,
  type Category,
} from "@/features/customize/PluginCategoryChips";
import { PluginCard } from "@/features/customize/PluginCard";
import { plugins } from "@/lib/mock/plugins";

export function PluginsBody() {
  const { t } = useTranslation();
  const [category, setCategory] = useState<Category>("all");
  const [installed, setInstalled] = useState<Set<string>>(
    new Set(plugins.filter((p) => p.installed).map((p) => p.id)),
  );

  const list = useMemo(
    () =>
      category === "all"
        ? plugins
        : plugins.filter((p) => p.category === category),
    [category],
  );

  const toggleInstall = (id: string) => {
    setInstalled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto px-12 py-10">
      <header className="mb-6 flex flex-col gap-2">
        <h1 className="font-serif text-[28px] font-normal leading-none text-foreground">
          {t("customize.plugins.title")}
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {t("customize.plugins.subtitle")}
        </p>
      </header>
      <div className="mb-6">
        <PluginCategoryChips active={category} onChange={setCategory} />
      </div>
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((plugin) => (
          <PluginCard
            key={plugin.id}
            plugin={{ ...plugin, installed: installed.has(plugin.id) }}
            onInstall={() => toggleInstall(plugin.id)}
            onUninstall={() => toggleInstall(plugin.id)}
          />
        ))}
      </section>
      {list.length === 0 && (
        <p className="mt-12 text-center text-sm text-muted-foreground">
          {t("customize.plugins.empty")}
        </p>
      )}
    </div>
  );
}
