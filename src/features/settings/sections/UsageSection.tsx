import { RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUsageSummary } from "@/lib/data/usage-queries";
import type { UsageSummary } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import {
  formatCompactInteger,
  formatTokenCount,
  getUsageRange,
  type UsageRangeValue,
  usageRangeOptions,
} from "./usageSectionModels";

function metricItems(summary: UsageSummary) {
  const cacheTokens = summary.cacheCreationTokens + summary.cacheReadTokens;
  // 首版约定：总 token 包含输入、输出以及两类缓存 token；缓存卡片只展示合计。
  const totalTokens = summary.inputTokens + summary.outputTokens + cacheTokens;

  return [
    {
      labelKey: "settings.usage.totalTokens",
      value: formatTokenCount(totalTokens),
    },
    {
      labelKey: "settings.usage.inputTokens",
      value: formatTokenCount(summary.inputTokens),
    },
    {
      labelKey: "settings.usage.outputTokens",
      value: formatTokenCount(summary.outputTokens),
    },
    {
      labelKey: "settings.usage.cacheTokens",
      value: formatTokenCount(cacheTokens),
    },
    {
      labelKey: "settings.usage.runs",
      value: formatCompactInteger(summary.runCount),
    },
  ] as const;
}

export function UsageSection() {
  const { t } = useTranslation();
  const [rangeValue, setRangeValue] = useState<UsageRangeValue>("30d");
  const range = useMemo(() => getUsageRange(rangeValue), [rangeValue]);
  const usageQuery = useUsageSummary(range);
  const summary = usageQuery.data;
  const isEmpty = Boolean(summary && summary.runCount === 0);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="font-serif text-[32px] font-normal leading-none text-foreground">
            {t("settings.usage.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("settings.usage.description")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => usageQuery.refetch()}
          className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-foreground hover:bg-state-hover"
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          <span>{t("settings.usage.refresh")}</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {usageRangeOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setRangeValue(option.value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              rangeValue === option.value
                ? "bg-state-selected text-foreground"
                : "text-muted-foreground hover:bg-state-hover hover:text-foreground",
            )}
          >
            {t(option.labelKey as never)}
          </button>
        ))}
      </div>

      {usageQuery.isLoading && (
        <p className="rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          {t("settings.usage.loading")}
        </p>
      )}

      {usageQuery.isError && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3">
          <p className="text-sm text-muted-foreground">
            {t("settings.usage.error")}
          </p>
          <button
            type="button"
            onClick={() => usageQuery.refetch()}
            className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-foreground hover:bg-state-hover"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            <span>{t("settings.usage.retry")}</span>
          </button>
        </div>
      )}

      {summary && !usageQuery.isError && (
        <>
          {isEmpty && (
            <p className="rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
              {t("settings.usage.empty")}
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {metricItems(summary).map((item) => (
              <div
                key={item.labelKey}
                className="rounded-md border border-border bg-card p-4"
              >
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  {t(item.labelKey as never)}
                </p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
