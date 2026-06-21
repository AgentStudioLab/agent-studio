import type {
  EnabledModelOption,
  ProviderModelSelection,
} from "@/lib/data/settings";

interface ResolveThreadProviderSelectionInput {
  conversationModel?: string | null;
  enabledModels: EnabledModelOption[];
  defaultSelection?: ProviderModelSelection | null;
  localSelection?: ProviderModelSelection | null;
}

function isEnabledSelection(
  selection: ProviderModelSelection,
  enabledModels: EnabledModelOption[],
): boolean {
  return enabledModels.some(
    (model) =>
      model.providerId === selection.providerId &&
      model.modelId === selection.modelId,
  );
}

export function resolveThreadProviderSelection({
  conversationModel,
  enabledModels,
  defaultSelection,
  localSelection,
}: ResolveThreadProviderSelectionInput): ProviderModelSelection | null {
  if (localSelection && isEnabledSelection(localSelection, enabledModels)) {
    return localSelection;
  }

  if (conversationModel) {
    const matches = enabledModels.filter(
      (model) => model.modelId === conversationModel,
    );
    if (matches.length === 1) {
      const match = matches[0]!;
      return { providerId: match.providerId, modelId: match.modelId };
    }

    if (
      matches.length > 1 &&
      defaultSelection?.modelId === conversationModel &&
      matches.some((model) => model.providerId === defaultSelection.providerId)
    ) {
      return defaultSelection;
    }

    if (matches.length > 1) {
      const match = matches[0]!;
      return { providerId: match.providerId, modelId: match.modelId };
    }
  }

  return defaultSelection && isEnabledSelection(defaultSelection, enabledModels)
    ? defaultSelection
    : null;
}
