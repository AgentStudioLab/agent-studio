import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarPlus, Clock, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCreateScheduledTaskMutation } from "@/lib/data/scheduled-queries";
import type { Frequency } from "@/lib/data/types";

interface DailyBriefingSetupProps {
  agentId: string;
  onRunPrompt: (prompt: string) => Promise<void>;
}

const AUTO_APPROVED_WEB_TOOLS = ["WebFetch", "WebSearch"];

function linesFromSources(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

// 将用户在设置面板里的选择组装成可直接投递给智能体的一次性任务说明。
function buildDailyBriefingPrompt(input: {
  sources: string[];
  topic: string;
  audience: string;
  duration: string;
  language: string;
}): string {
  const sourceList = input.sources.map((source) => `- ${source}`).join("\n");
  const topic = input.topic.trim() || "重要变化、风险信号和适合继续观察的趋势";
  const audience = input.audience.trim() || "需要快速了解动态的听众";

  return [
    "请作为每日音频简报助手，基于以下固定信息源生成今天可录制的短音频简报。",
    "",
    "## 信息源",
    sourceList,
    "",
    "## 简报设定",
    `- 关注主题：${topic}`,
    `- 目标听众：${audience}`,
    `- 目标时长：${input.duration}`,
    `- 输出语言：${input.language}`,
    "",
    "## 工作要求",
    "- 先读取和核对信息源，再按重要性排序，不把未核验内容写成确定事实。",
    "- 如果信息源无法访问、内容过旧或相互冲突，单独列入 risk-notes.md。",
    "- 用适合口播的表达，不要照抄新闻标题或营销文案。",
    "- 输出今日最重要的 3-5 条变化，每条说明影响、依据和后续观察点。",
    "",
    "## 产物",
    "- daily-briefing-script.md：完整口播稿，包含开场、主体和收尾。",
    "- sources.md：每条信息的来源、链接和引用理由。",
    "- risk-notes.md：无法核验、来源冲突、版权或时效风险。",
    "- publish-copy.md：本期标题、摘要和可发布简介。",
  ].join("\n");
}

export function DailyBriefingSetup({
  agentId,
  onRunPrompt,
}: DailyBriefingSetupProps) {
  const { t } = useTranslation();
  const createTask = useCreateScheduledTaskMutation();
  const [sources, setSources] = useState("");
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [duration, setDuration] = useState("5 分钟");
  const [language, setLanguage] = useState("中文");
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [timeOfDay, setTimeOfDay] = useState("08:30");
  const [created, setCreated] = useState(false);

  const parsedSources = useMemo(() => linesFromSources(sources), [sources]);
  const canUse = parsedSources.length > 0;
  const isCreatingSchedule = createTask.isPending;

  const prompt = useMemo(
    () =>
      buildDailyBriefingPrompt({
        sources: parsedSources,
        topic,
        audience,
        duration,
        language,
      }),
    [audience, duration, language, parsedSources, topic],
  );

  const handleRunNow = () => {
    if (!canUse) return;
    void onRunPrompt(prompt);
  };

  const handleCreateSchedule = () => {
    if (!canUse) return;
    setCreated(false);
    createTask.mutate(
      {
        name: t("agentSpace.dailyBriefing.taskName"),
        description: t("agentSpace.dailyBriefing.taskDescription"),
        prompt,
        frequency,
        timeOfDay:
          frequency === "daily" || frequency === "weekdays" || frequency === "weekly"
            ? timeOfDay
            : null,
        weekday: frequency === "weekly" ? new Date().getDay() : null,
        agentWorkspaceId: agentId,
        permissionMode: "act-without-asking",
        allowedTools: AUTO_APPROVED_WEB_TOOLS,
        enabled: true,
      },
      {
        // 等后端确认创建成功后再提示，避免网络失败时给用户误导反馈。
        onSuccess: () => setCreated(true),
      },
    );
  };

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium text-foreground">
            {t("agentSpace.dailyBriefing.title")}
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {t("agentSpace.dailyBriefing.description")}
          </p>
        </div>
        <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      </div>

      <div className="mt-4 grid gap-4">
        <label className="grid gap-1.5 text-sm font-medium text-foreground">
          {t("agentSpace.dailyBriefing.sourcesLabel")}
          <Textarea
            aria-label={t("agentSpace.dailyBriefing.sourcesLabel")}
            value={sources}
            onChange={(event) => setSources(event.target.value)}
            placeholder={t("agentSpace.dailyBriefing.sourcesPlaceholder")}
            className="min-h-24"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            {t("agentSpace.dailyBriefing.topicLabel")}
            <Input
              aria-label={t("agentSpace.dailyBriefing.topicLabel")}
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder={t("agentSpace.dailyBriefing.topicPlaceholder")}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            {t("agentSpace.dailyBriefing.audienceLabel")}
            <Input
              aria-label={t("agentSpace.dailyBriefing.audienceLabel")}
              value={audience}
              onChange={(event) => setAudience(event.target.value)}
              placeholder={t("agentSpace.dailyBriefing.audiencePlaceholder")}
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            {t("agentSpace.dailyBriefing.durationLabel")}
            <select
              aria-label={t("agentSpace.dailyBriefing.durationLabel")}
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
              className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="3 分钟">{t("agentSpace.dailyBriefing.durationThree")}</option>
              <option value="5 分钟">{t("agentSpace.dailyBriefing.durationFive")}</option>
              <option value="8 分钟">{t("agentSpace.dailyBriefing.durationEight")}</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            {t("agentSpace.dailyBriefing.languageLabel")}
            <select
              aria-label={t("agentSpace.dailyBriefing.languageLabel")}
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="中文">{t("agentSpace.dailyBriefing.languageChinese")}</option>
              <option value="English">{t("agentSpace.dailyBriefing.languageEnglish")}</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            {t("agentSpace.dailyBriefing.scheduleLabel")}
            <select
              aria-label={t("agentSpace.dailyBriefing.scheduleLabel")}
              value={frequency}
              onChange={(event) => setFrequency(event.target.value as Frequency)}
              className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="daily">{t("agentSpace.dailyBriefing.scheduleDaily")}</option>
              <option value="weekdays">{t("agentSpace.dailyBriefing.scheduleWeekdays")}</option>
              <option value="weekly">{t("agentSpace.dailyBriefing.scheduleWeekly")}</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            {t("agentSpace.dailyBriefing.timeLabel")}
            <Input
              aria-label={t("agentSpace.dailyBriefing.timeLabel")}
              type="time"
              value={timeOfDay}
              onChange={(event) => setTimeOfDay(event.target.value)}
            />
          </label>
        </div>

        <div className="rounded-md bg-muted px-3 py-2 text-xs leading-5 text-muted-foreground">
          {t("agentSpace.dailyBriefing.backgroundHint")}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {canUse
              ? t("agentSpace.dailyBriefing.readyHint", {
                  count: String(parsedSources.length),
                })
              : t("agentSpace.dailyBriefing.sourcesRequired")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={handleRunNow} disabled={!canUse}>
              <Play className="size-4" />
              {t("agentSpace.dailyBriefing.runNow")}
            </Button>
            <Button
              type="button"
              onClick={handleCreateSchedule}
              disabled={!canUse || isCreatingSchedule}
            >
              <CalendarPlus className="size-4" />
              {t("agentSpace.dailyBriefing.createSchedule")}
            </Button>
          </div>
        </div>

        {created && (
          <p className="text-xs font-medium text-primary">
            {t("agentSpace.dailyBriefing.created")}
          </p>
        )}
      </div>
    </section>
  );
}
