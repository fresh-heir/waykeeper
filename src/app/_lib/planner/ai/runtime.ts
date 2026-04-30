import type {
  PlannerAiAppliedProviderOptions,
  PlannerAiFlow,
  PlannerAiReplanPayload,
  PlannerAiParseStrategy,
  PlannerAiTokenUsageDiagnostics,
} from "@/app/_lib/planner/ai/types";

export interface PlannerAiTimeoutPolicy {
  softMs: number;
  hardMs: number;
  upstreamMs: number;
}

export const DEFAULT_PLANNER_AI_TIMEOUT_POLICY: Record<
  PlannerAiFlow,
  PlannerAiTimeoutPolicy
> = {
  parse: {
    softMs: 15_000,
    hardMs: 80_000,
    upstreamMs: 85_000,
  },
  draft: {
    softMs: 20_000,
    hardMs: 90_000,
    upstreamMs: 95_000,
  },
  replan: {
    softMs: 15_000,
    hardMs: 80_000,
    upstreamMs: 85_000,
  },
};

export function getPlannerAiTimeoutPolicy(flow: PlannerAiFlow) {
  return DEFAULT_PLANNER_AI_TIMEOUT_POLICY[flow];
}

type PlannerAiReasoningEffort = "minimal" | "low" | "medium" | "high";
type PlannerAiServiceTier = "priority" | "auto";

interface PlannerAiModelCapabilities {
  family: string;
  supportsReasoningControls: boolean;
  supportsPromptCaching: boolean;
  supportsServiceTier: boolean;
}

interface PlannerAiCapabilityProfile extends PlannerAiModelCapabilities {
  matches: RegExp[];
}

const PLANNER_AI_MODEL_CAPABILITY_PROFILES: PlannerAiCapabilityProfile[] = [
  {
    family: "gpt-5-mini",
    matches: [/^gpt-5-mini(?:$|[-:])/i],
    supportsReasoningControls: true,
    supportsPromptCaching: true,
    supportsServiceTier: true,
  },
  {
    family: "gpt-5-nano",
    matches: [/^gpt-5-nano(?:$|[-:])/i],
    supportsReasoningControls: true,
    supportsPromptCaching: true,
    supportsServiceTier: true,
  },
  {
    family: "gpt-5",
    matches: [/^gpt-5(?:$|[-:])/i],
    supportsReasoningControls: true,
    supportsPromptCaching: true,
    supportsServiceTier: true,
  },
  {
    family: "o4-mini",
    matches: [/^o4-mini(?:$|[-:])/i],
    supportsReasoningControls: true,
    supportsPromptCaching: true,
    supportsServiceTier: true,
  },
  {
    family: "o3",
    matches: [/^o3(?:$|[-:])/i],
    supportsReasoningControls: true,
    supportsPromptCaching: true,
    supportsServiceTier: true,
  },
];

const DEFAULT_REASONING_EFFORT_BY_FLOW: Record<
  PlannerAiFlow,
  PlannerAiReasoningEffort
> = {
  parse: "minimal",
  draft: "low",
  replan: "low",
};

const DEFAULT_MAX_OUTPUT_TOKENS_BY_FLOW: Record<PlannerAiFlow, number> = {
  parse: 1400,
  draft: 3600,
  replan: 2400,
};

export const PLANNER_AI_PROMPT_CACHE_VERSION = "planner-ai-v2";

export function shouldUseHighTierReplanModel(payload: PlannerAiReplanPayload) {
  const futureLockedAnchors = payload.currentBlocks.filter(
    (block) => block.locked
  ).length;
  const placedTaskIds = new Set(
    payload.currentBlocks.flatMap((block) => (block.taskId ? [block.taskId] : []))
  );
  const hasUnplacedWork = payload.remainingTaskIds.some(
    (taskId) => !placedTaskIds.has(taskId)
  );

  return (
    futureLockedAnchors >= 2 ||
    payload.remainingTaskIds.length >= 4 ||
    payload.tasks.some((task) => Boolean(task.carryForward)) ||
    hasUnplacedWork ||
    payload.replanMode === "keep_essentials_only" ||
    payload.replanMode === "preserve_focus_first"
  );
}

export function selectPlannerAiModel(request: {
  flow: PlannerAiFlow;
  payload?: unknown;
  strategy?: PlannerAiParseStrategy;
}) {
  const fallbackModel = process.env.OPENAI_MODEL ?? "gpt-5";

  switch (request.flow) {
    case "parse":
      return request.strategy === "refine"
        ? process.env.OPENAI_MODEL_PARSE_REFINE ?? fallbackModel
        : process.env.OPENAI_MODEL_PARSE_FULL ?? fallbackModel;
    case "draft":
      return process.env.OPENAI_MODEL_DRAFT ?? fallbackModel;
    case "replan":
      return request.payload &&
        shouldUseHighTierReplanModel(request.payload as PlannerAiReplanPayload)
        ? process.env.OPENAI_MODEL_REPLAN_HIGH ??
            process.env.OPENAI_MODEL_REPLAN ??
            fallbackModel
        : process.env.OPENAI_MODEL_REPLAN ?? fallbackModel;
  }
}

export function getPlannerAiModelCapabilities(
  model: string
): PlannerAiModelCapabilities {
  const profile = PLANNER_AI_MODEL_CAPABILITY_PROFILES.find(({ matches }) =>
    matches.some((pattern) => pattern.test(model))
  );

  if (!profile) {
    return {
      family: model,
      supportsReasoningControls: false,
      supportsPromptCaching: false,
      supportsServiceTier: false,
    };
  }

  return {
    family: profile.family,
    supportsReasoningControls: profile.supportsReasoningControls,
    supportsPromptCaching: profile.supportsPromptCaching,
    supportsServiceTier: profile.supportsServiceTier,
  };
}

export function buildPlannerAiProviderOptions(request: {
  flow: PlannerAiFlow;
  model: string;
  strategy?: PlannerAiParseStrategy;
}) {
  const capabilities = getPlannerAiModelCapabilities(request.model);
  const requestOptions: Record<string, unknown> = {};
  const diagnostics: PlannerAiAppliedProviderOptions = {};

  const maxOutputTokens = getPlannerAiMaxOutputTokens(request.flow);
  if (typeof maxOutputTokens === "number") {
    requestOptions.max_output_tokens = maxOutputTokens;
    diagnostics.maxOutputTokens = maxOutputTokens;
  }

  const serviceTier = getPlannerAiInteractiveServiceTier();
  if (capabilities.supportsServiceTier && serviceTier) {
    requestOptions.service_tier = serviceTier;
    diagnostics.serviceTier = serviceTier;
  }

  const reasoningEffort = getPlannerAiReasoningEffort(request.flow);
  if (capabilities.supportsReasoningControls && reasoningEffort) {
    requestOptions.reasoning = {
      effort: reasoningEffort,
    };
    diagnostics.reasoningEffort = reasoningEffort;
  }

  if (capabilities.supportsPromptCaching) {
    const promptCachingEnabled = isPlannerAiPromptCachingEnabled();
    diagnostics.promptCaching = {
      enabled: promptCachingEnabled,
    };

    if (promptCachingEnabled) {
      const promptCacheKey = buildPlannerAiPromptCacheKey({
        flow: request.flow,
        modelFamily: capabilities.family,
        strategy: request.strategy,
      });
      const promptCacheRetention = getPlannerAiPromptCacheRetention();
      requestOptions.prompt_cache_key = promptCacheKey;
      diagnostics.promptCaching.key = promptCacheKey;

      if (promptCacheRetention) {
        requestOptions.prompt_cache_retention = promptCacheRetention;
        diagnostics.promptCaching.retention = promptCacheRetention;
      }
    }
  }

  return {
    requestOptions,
    diagnostics: Object.keys(diagnostics).length > 0 ? diagnostics : undefined,
  };
}

export function didPlannerAiHitOutputCap({
  providerOptions,
  tokenUsage,
}: {
  providerOptions: PlannerAiAppliedProviderOptions | undefined;
  tokenUsage: PlannerAiTokenUsageDiagnostics | undefined;
}) {
  if (
    typeof providerOptions?.maxOutputTokens !== "number" ||
    typeof tokenUsage?.outputTokens !== "number"
  ) {
    return undefined;
  }

  return tokenUsage.outputTokens >= providerOptions.maxOutputTokens;
}

function getPlannerAiInteractiveServiceTier(): PlannerAiServiceTier | undefined {
  const configuredTier = process.env.OPENAI_SERVICE_TIER_INTERACTIVE?.trim();

  if (!configuredTier) {
    return "priority";
  }

  if (configuredTier === "priority" || configuredTier === "auto") {
    return configuredTier;
  }

  return undefined;
}

function getPlannerAiReasoningEffort(
  flow: PlannerAiFlow
): PlannerAiReasoningEffort | undefined {
  const configuredEffort =
    (
      {
        parse: process.env.OPENAI_REASONING_EFFORT_PARSE,
        draft: process.env.OPENAI_REASONING_EFFORT_DRAFT,
        replan: process.env.OPENAI_REASONING_EFFORT_REPLAN,
      } satisfies Partial<Record<PlannerAiFlow, string | undefined>>
    )[flow]?.trim() ?? DEFAULT_REASONING_EFFORT_BY_FLOW[flow];

  if (
    configuredEffort === "minimal" ||
    configuredEffort === "low" ||
    configuredEffort === "medium" ||
    configuredEffort === "high"
  ) {
    return configuredEffort;
  }

  return undefined;
}

function getPlannerAiMaxOutputTokens(flow: PlannerAiFlow) {
  return parsePositiveIntegerEnv(
    (
      {
        parse: process.env.OPENAI_MAX_OUTPUT_TOKENS_PARSE,
        draft: process.env.OPENAI_MAX_OUTPUT_TOKENS_DRAFT,
        replan: process.env.OPENAI_MAX_OUTPUT_TOKENS_REPLAN,
      } satisfies Partial<Record<PlannerAiFlow, string | undefined>>
    )[flow],
    DEFAULT_MAX_OUTPUT_TOKENS_BY_FLOW[flow]
  );
}

function isPlannerAiPromptCachingEnabled() {
  const configuredValue = process.env.OPENAI_PROMPT_CACHE?.trim();

  if (!configuredValue) {
    return true;
  }

  return !["0", "false", "off", "no"].includes(configuredValue.toLowerCase());
}

function getPlannerAiPromptCacheRetention() {
  return process.env.OPENAI_PROMPT_CACHE_RETENTION?.trim() || "24h";
}

function buildPlannerAiPromptCacheKey({
  flow,
  modelFamily,
  strategy,
}: {
  flow: PlannerAiFlow;
  modelFamily: string;
  strategy?: PlannerAiParseStrategy;
}) {
  return [
    "waykeeper",
    "planner-ai",
    PLANNER_AI_PROMPT_CACHE_VERSION,
    flow,
    strategy ?? "default",
    modelFamily,
  ].join(":");
}

function parsePositiveIntegerEnv(
  rawValue: string | undefined,
  fallback: number
) {
  const parsed = Number.parseInt(rawValue ?? "", 10);

  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return fallback;
}
