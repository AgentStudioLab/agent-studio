/* 由 .design-sync/gen-ds-package.mjs 自动生成——请勿手改。
 * 合成的设计系统 barrel：把所有有 story 的组件聚合到一个入口，
 * design-sync 会将其 bundle 成 window.AgentStudio.*。 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { MessageQueueProvider } from "@/features/task/MessageQueueContext";
import { defaultThemeId } from "@/styles/themes/registry";

// 复刻 App.tsx 的根 provider 栈，用 bundle 自身的实例，保证预览里的 provider 与
// 组件共享同一份 React context。cfg.provider 会按
// QueryClient > MemoryRouter > Auth > AppShell > MessageQueue > Tooltip 嵌套，
// 让依赖 useLocation/useAuth/useAppShell 的视图组件能正常渲染。
// AppShellProvider 由下方自动重导出块导出（来自 @/app/AppShellContext）。
export { QueryClientProvider, MemoryRouter, TooltipProvider, AuthProvider, MessageQueueProvider };
export const dsQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

// 复刻 preview.tsx：storybook/预览各有自己的 <html>，需在 bundle 载入时种下
// data-brand，否则品牌/强调色不生效。
if (typeof document !== "undefined") {
  try {
    document.documentElement.setAttribute("data-brand", defaultThemeId());
  } catch {}
}

// ↓ 各组件按源模块重新导出（去重）。
export { AppShell } from "@/app/AppShell";
export { AppShellProvider, useAppShell } from "@/app/AppShellContext";
export { Artifact, ArtifactAction, ArtifactActions, ArtifactClose, ArtifactContent, ArtifactDescription, ArtifactHeader, ArtifactTitle } from "@/components/ai-elements/artifact";
export { Canvas } from "@/components/ai-elements/canvas";
export { ChainOfThought, ChainOfThoughtContent, ChainOfThoughtHeader, ChainOfThoughtImage, ChainOfThoughtSearchResult, ChainOfThoughtSearchResults, ChainOfThoughtStep } from "@/components/ai-elements/chain-of-thought";
export { CodeBlock, CodeBlockActions, CodeBlockContainer, CodeBlockContent, CodeBlockCopyButton, CodeBlockFilename, CodeBlockHeader, CodeBlockLanguageSelector, CodeBlockLanguageSelectorContent, CodeBlockLanguageSelectorItem, CodeBlockLanguageSelectorTrigger, CodeBlockLanguageSelectorValue, CodeBlockTitle, highlightCode } from "@/components/ai-elements/code-block";
export { Confirmation, ConfirmationAccepted, ConfirmationAction, ConfirmationActions, ConfirmationRejected, ConfirmationRequest, ConfirmationTitle } from "@/components/ai-elements/confirmation";
export { FileTree, FileTreeActions, FileTreeFile, FileTreeFolder, FileTreeIcon, FileTreeName } from "@/components/ai-elements/file-tree";
export { Message, MessageAction, MessageActions, MessageBranch, MessageBranchContent, MessageBranchNext, MessageBranchPage, MessageBranchPrevious, MessageBranchSelector, MessageContent, MessageResponse, MessageToolbar } from "@/components/ai-elements/message";
export { Plan, PlanAction, PlanContent, PlanDescription, PlanFooter, PlanHeader, PlanTitle, PlanTrigger } from "@/components/ai-elements/plan";
export { LocalReferencedSourcesContext, PromptInput, PromptInputActionAddAttachments, PromptInputActionAddScreenshot, PromptInputActionMenu, PromptInputActionMenuContent, PromptInputActionMenuItem, PromptInputActionMenuTrigger, PromptInputBody, PromptInputButton, PromptInputCommand, PromptInputCommandEmpty, PromptInputCommandGroup, PromptInputCommandInput, PromptInputCommandItem, PromptInputCommandList, PromptInputCommandSeparator, PromptInputFooter, PromptInputHeader, PromptInputHoverCard, PromptInputHoverCardContent, PromptInputHoverCardTrigger, PromptInputProvider, PromptInputSelect, PromptInputSelectContent, PromptInputSelectItem, PromptInputSelectTrigger, PromptInputSelectValue, PromptInputSubmit, PromptInputTab, PromptInputTabBody, PromptInputTabItem, PromptInputTabLabel, PromptInputTabsList, PromptInputTextarea, PromptInputTools, usePromptInputAttachments, usePromptInputController, usePromptInputReferencedSources, useProviderAttachments } from "@/components/ai-elements/prompt-input";
export { Shimmer } from "@/components/ai-elements/shimmer";
export { SpriteLoader } from "@/components/ai-elements/sprite-loader";
export { Task, TaskContent, TaskItem, TaskItemFile, TaskTrigger } from "@/components/ai-elements/task";
export { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput, getStatusBadge } from "@/components/ai-elements/tool";
export { Toolbar, ToolbarButton } from "@/components/ai-elements/toolbar";
export { Button, buttonVariants } from "@/components/ui/button";
export { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
export { AgentCard } from "@/features/customize/AgentCard";
export { AgentDetail } from "@/features/customize/AgentDetail";
export { AgentsBody } from "@/features/customize/AgentsBody";
export { CustomizeHome } from "@/features/customize/CustomizeHome";
export { CustomizeNav } from "@/features/customize/CustomizeNav";
export { CustomizeView } from "@/features/customize/CustomizeView";
export { PluginCard } from "@/features/customize/PluginCard";
export { CATEGORIES, PluginCategoryChips } from "@/features/customize/PluginCategoryChips";
export { PluginsBody } from "@/features/customize/PluginsBody";
export { SkillCard } from "@/features/customize/SkillCard";
export { SkillsBody } from "@/features/customize/SkillsBody";
export { NewTaskView } from "@/features/new-task/NewTaskView";
export { FrequencyChip } from "@/features/scheduled/FrequencyChip";
export { KeepAwakeBanner } from "@/features/scheduled/KeepAwakeBanner";
export { NewScheduledModal } from "@/features/scheduled/NewScheduledModal";
export { ScheduledCard } from "@/features/scheduled/ScheduledCard";
export { ScheduledDetailView } from "@/features/scheduled/ScheduledDetailView";
export { ScheduledListView } from "@/features/scheduled/ScheduledListView";
export { ProfileForm } from "@/features/settings/ProfileForm";
export { NavItem } from "@/features/sidebar/NavItem";
export { PinnedItem } from "@/features/sidebar/PinnedItem";
export { RecentItem } from "@/features/sidebar/RecentItem";
export { Sidebar } from "@/features/sidebar/Sidebar";
export { SidebarItemContextMenu } from "@/features/sidebar/SidebarItemContextMenu";
export { UserBar } from "@/features/sidebar/UserBar";
export { UserPopover } from "@/features/sidebar/UserPopover";
export { ContextTab } from "@/features/task/ContextTab";
export { FilesTab } from "@/features/task/FilesTab";
export { PreviewPane } from "@/features/task/PreviewPane";
export { TaskHeader } from "@/features/task/TaskHeader";
export { TaskView } from "@/features/task/TaskView";
export { AskUserCard } from "@/features/task/ask-user/AskUserCard";
export { BrandStar } from "@/shared/atoms/BrandStar";
export { InitialsAvatar } from "@/shared/atoms/InitialsAvatar";
export { StatusDot } from "@/shared/atoms/StatusDot";
export { ThemeSegment } from "@/shared/atoms/ThemeSegment";
