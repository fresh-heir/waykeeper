import assert from "node:assert/strict";

import { loadEnvConfig } from "@next/env";

import {
  hasBlockingErrors,
  validateDaySetupDraft,
} from "@/app/_lib/intake-flow";
import { mockPlannerState } from "@/app/_lib/mock-day-plan";
import {
  buildDraftPayloadFromParsedTasks,
  buildPlannerAiDraftLocalScaffold,
  buildPlannerAiParseContext,
  buildPlannerAiReplanLocalScaffold,
  buildPlannerAiReplanPayload,
} from "@/app/_lib/planner/ai/context";
import {
  buildPlannerAiSystemPrompt,
  buildPlannerAiUserPrompt,
} from "@/app/_lib/planner/ai/prompts";
import {
  getPlannerAiResponseJsonSchema,
  getPlannerAiResponseSchema,
  getPlannerAiResponseSchemaName,
} from "@/app/_lib/planner/ai/schemas";
import {
  buildPlannerAiProviderOptions,
  didPlannerAiHitOutputCap,
  selectPlannerAiModel,
} from "@/app/_lib/planner/ai/runtime";
import type {
  PlannerAiFlow,
  PlannerAiRouteRequest,
  PlannerAiTokenUsageDiagnostics,
} from "@/app/_lib/planner/ai/types";
import type { PlannerDevScenario } from "@/app/_lib/planner/dev-scenarios";
import { plannerDevScenarios } from "@/app/_lib/planner/dev-scenarios";
import {
  buildDraftRoute,
  buildPlannerView,
  createPlannerStoreState,
  getPlannerStoreContext,
  interpretPlannerDraft,
  loadPlannerDevScenario,
} from "@/app/_lib/planner/store";
import { replanRemainingDay } from "@/app/_lib/planner/scheduler";

const BASE_OFFSET = "-08:00";
const DEFAULT_SAMPLE_COUNT = 3;

loadEnvConfig(process.cwd());

interface BenchmarkDefinition {
  flow: PlannerAiFlow;
  label: string;
  scenarioId: string;
  buildRequest: (
    scenario: PlannerDevScenario
  ) => Extract<PlannerAiRouteRequest, { flow: PlannerAiFlow }>;
}

interface BenchmarkSampleResult {
  durationMs: number;
  fetchMs: number;
  payloadBytes: number;
  providerOptions: ReturnType<typeof buildPlannerAiProviderOptions>["diagnostics"];
  tokenUsage?: PlannerAiTokenUsageDiagnostics;
  schemaPassed: boolean;
  outputCapHit?: boolean;
}

function buildScenarioIsoDateTime(date: string, time: string) {
  return `${date}T${time}:00${BASE_OFFSET}`;
}

function replaceIsoDate(isoDateTime: string, date: string) {
  return isoDateTime.replace(/^\d{4}-\d{2}-\d{2}/, date);
}

function buildScenarioState(scenario: PlannerDevScenario) {
  const scenarioDate = scenario.date ?? mockPlannerState.dayPlan.date;
  const currentTime = scenario.currentTime
    ? buildScenarioIsoDateTime(scenarioDate, scenario.currentTime)
    : replaceIsoDate(mockPlannerState.currentTime, scenarioDate);
  const planner = {
    ...mockPlannerState,
    currentTime,
    dayPlan: {
      ...mockPlannerState.dayPlan,
      date: scenarioDate,
      planningWindow: {
        startTime: replaceIsoDate(
          mockPlannerState.dayPlan.planningWindow.startTime,
          scenarioDate
        ),
        endTime: replaceIsoDate(
          mockPlannerState.dayPlan.planningWindow.endTime,
          scenarioDate
        ),
      },
      rawInput: {
        ...mockPlannerState.dayPlan.rawInput,
        createdAt: replaceIsoDate(
          mockPlannerState.dayPlan.rawInput.createdAt,
          scenarioDate
        ),
      },
    },
  };
  const context = getPlannerStoreContext(planner);
  let state = createPlannerStoreState(planner);

  state = loadPlannerDevScenario(state, context, scenario);
  state = interpretPlannerDraft(state, context);
  state = buildDraftRoute(state, planner, context);

  return {
    context,
    planner,
    state,
  };
}

const BENCHMARKS: BenchmarkDefinition[] = [
  {
    flow: "parse",
    label: "parse / Normal realistic day",
    scenarioId: "normal-realistic-day",
    buildRequest: (scenario) => {
      const { context, state } = buildScenarioState(scenario);
      const validation = validateDaySetupDraft(state.intakeDraft, context);
      const parseContext = buildPlannerAiParseContext({
        draft: state.intakeDraft,
        context,
        hasBlockingErrors: hasBlockingErrors(validation.errors),
      });

      return {
        flow: "parse",
        includeDiagnostics: true,
        strategy: parseContext.strategy,
        payload: parseContext.payload,
      };
    },
  },
  {
    flow: "draft",
    label: "draft / AI draft believability comparison",
    scenarioId: "ai-draft-believability-comparison-test",
    buildRequest: (scenario) => {
      const { planner, state, context } = buildScenarioState(scenario);
      assert.ok(state.parsedTaskResponse, "expected parsed task response for draft bench");
      assert.ok(
        state.draftScheduleResponse,
        "expected built local draft route for draft bench"
      );

      return {
        flow: "draft",
        includeDiagnostics: true,
        payload: buildDraftPayloadFromParsedTasks({
          currentTime: planner.currentTime,
          draft: state.intakeDraft,
          hardEvents: state.parsedTaskResponse.hardEvents,
          localScaffold: buildPlannerAiDraftLocalScaffold(
            state.draftScheduleResponse
          ),
          parsedTaskResponse: state.parsedTaskResponse,
          context,
        }),
      };
    },
  },
  {
    flow: "replan",
    label: "replan / AI stale-route replan comparison",
    scenarioId: "ai-stale-route-replan-comparison-test",
    buildRequest: (scenario) => {
      const { planner, state, context } = buildScenarioState(scenario);
      const plannerView = buildPlannerView(planner, state, context);
      const localPreview = replanRemainingDay({
        currentTime: planner.currentTime,
        dayPlan: plannerView.dayPlan,
        replanMode: "replan_from_now",
      });

      return {
        flow: "replan",
        includeDiagnostics: true,
        payload: buildPlannerAiReplanPayload({
          currentTime: planner.currentTime,
          dayPlan: plannerView.dayPlan,
          localScaffold: buildPlannerAiReplanLocalScaffold({
            ...localPreview,
            mode: "replan_from_now",
          }),
          replanMode: "replan_from_now",
        }),
      };
    },
  },
];

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required to run the latency benchmark.");
  }

  const sampleCount = parsePositiveInteger(
    process.argv
      .slice(2)
      .find((argument) => argument.startsWith("--samples="))
      ?.split("=")[1],
    DEFAULT_SAMPLE_COUNT
  );

  console.log(
    `Planner AI latency benchmark running ${sampleCount} sample(s) per flow.\n`
  );

  for (const benchmark of BENCHMARKS) {
    const scenario = getScenario(benchmark.scenarioId);
    const request = benchmark.buildRequest(scenario);
    const samples: BenchmarkSampleResult[] = [];

    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      samples.push(await runBenchmarkSample({ apiKey, request }));
    }

    const medianDurationMs = median(samples.map((sample) => sample.durationMs));
    const medianFetchMs = median(samples.map((sample) => sample.fetchMs));
    const medianPayloadBytes = median(samples.map((sample) => sample.payloadBytes));
    const medianInputTokens = medianOptionalNumber(
      samples.map((sample) => sample.tokenUsage?.inputTokens)
    );
    const medianCachedInputTokens = medianOptionalNumber(
      samples.map((sample) => sample.tokenUsage?.cachedInputTokens)
    );
    const medianUncachedInputTokens = medianOptionalNumber(
      samples.map((sample) => sample.tokenUsage?.uncachedInputTokens)
    );
    const medianOutputTokens = medianOptionalNumber(
      samples.map((sample) => sample.tokenUsage?.outputTokens)
    );
    const medianReasoningTokens = medianOptionalNumber(
      samples.map((sample) => sample.tokenUsage?.reasoningTokens)
    );
    const schemaFailures = samples.filter((sample) => !sample.schemaPassed).length;
    const outputCapHits = samples.filter((sample) => sample.outputCapHit).length;
    const firstSample = samples[0];

    console.log(benchmark.label);
    console.log(`  median duration: ${medianDurationMs}ms`);
    console.log(`  median fetch: ${medianFetchMs}ms`);
    console.log(`  median payload: ${medianPayloadBytes} bytes`);
    console.log(`  schema failures: ${schemaFailures}/${samples.length}`);
    console.log(`  output-cap hits: ${outputCapHits}/${samples.length}`);
    if (typeof medianInputTokens === "number") {
      console.log(`  median input tokens: ${medianInputTokens}`);
    }
    if (typeof medianCachedInputTokens === "number") {
      console.log(`  median cached input tokens: ${medianCachedInputTokens}`);
    }
    if (typeof medianUncachedInputTokens === "number") {
      console.log(`  median uncached input tokens: ${medianUncachedInputTokens}`);
    }
    if (typeof medianOutputTokens === "number") {
      console.log(`  median output tokens: ${medianOutputTokens}`);
    }
    if (typeof medianReasoningTokens === "number") {
      console.log(`  median reasoning tokens: ${medianReasoningTokens}`);
    }

    if (firstSample.providerOptions) {
      console.log(
        `  provider options: ${JSON.stringify(firstSample.providerOptions)}`
      );
    }

    if (firstSample.tokenUsage) {
      console.log(`  token usage: ${JSON.stringify(firstSample.tokenUsage)}`);
    }

    console.log("");
  }
}

async function runBenchmarkSample({
  apiKey,
  request,
}: {
  apiKey: string;
  request: PlannerAiRouteRequest;
}): Promise<BenchmarkSampleResult> {
  const model = selectPlannerAiModel(request);
  const providerOptions = buildPlannerAiProviderOptions({
    flow: request.flow,
    model,
    strategy: request.flow === "parse" ? request.strategy : undefined,
  });
  const promptBuildStartedAt = Date.now();
  const requestBody = {
    model,
    input: [
      {
        role: "system",
        content: buildPlannerAiSystemPrompt(request.flow, {
          strategy: request.flow === "parse" ? request.strategy : undefined,
        }),
      },
      {
        role: "user",
        content: buildPlannerAiUserPrompt(request.payload),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: getPlannerAiResponseSchemaName(request.flow),
        schema: getPlannerAiResponseJsonSchema(request.flow),
        strict: true,
      },
    },
    ...providerOptions.requestOptions,
  };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(requestBody)).byteLength;
  const promptBuildMs = Date.now() - promptBuildStartedAt;

  const fetchStartedAt = Date.now();
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });
  const fetchMs = Date.now() - fetchStartedAt;
  const json = (await response.json()) as Record<string, unknown>;
  const outputText = extractOutputText(json);
  const tokenUsage = extractTokenUsage(json);
  const outputCapHit = didPlannerAiHitOutputCap({
    providerOptions: providerOptions.diagnostics,
    tokenUsage,
  });
  let schemaPassed = false;

  if (response.ok && outputText) {
    try {
      const parsedOutput = JSON.parse(outputText);
      schemaPassed = getPlannerAiResponseSchema(request.flow).safeParse(parsedOutput)
        .success;
    } catch {
      schemaPassed = false;
    }
  }

  return {
    durationMs: promptBuildMs + fetchMs,
    fetchMs,
    payloadBytes,
    providerOptions: providerOptions.diagnostics,
    tokenUsage,
    schemaPassed,
    outputCapHit,
  };
}

function getScenario(id: string) {
  const scenario = plannerDevScenarios.find((candidate) => candidate.id === id);

  assert.ok(scenario, `Missing dev scenario for latency benchmark: ${id}`);
  return scenario;
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return Math.round((sorted[midpoint - 1] + sorted[midpoint]) / 2);
  }

  return sorted[midpoint] ?? 0;
}

function medianOptionalNumber(values: Array<number | undefined>) {
  const presentValues = values.filter(
    (value): value is number => typeof value === "number"
  );

  if (presentValues.length === 0) {
    return undefined;
  }

  return median(presentValues);
}

function parsePositiveInteger(rawValue: string | undefined, fallback: number) {
  const parsed = Number.parseInt(rawValue ?? "", 10);

  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return fallback;
}

function extractOutputText(response: Record<string, unknown>) {
  const directOutput = response.output_text;

  if (typeof directOutput === "string" && directOutput.trim()) {
    return directOutput;
  }

  const outputs = Array.isArray(response.output) ? response.output : [];

  for (const outputItem of outputs) {
    if (!outputItem || typeof outputItem !== "object") {
      continue;
    }

    const contentItems = Array.isArray((outputItem as { content?: unknown }).content)
      ? ((outputItem as { content: unknown[] }).content as unknown[])
      : [];

    for (const contentItem of contentItems) {
      if (!contentItem || typeof contentItem !== "object") {
        continue;
      }

      if (
        (contentItem as { type?: unknown }).type === "output_text" &&
        typeof (contentItem as { text?: unknown }).text === "string"
      ) {
        return (contentItem as { text: string }).text;
      }
    }
  }

  return null;
}

function extractTokenUsage(
  response: Record<string, unknown>
): PlannerAiTokenUsageDiagnostics | undefined {
  const usage = response.usage;

  if (!usage || typeof usage !== "object") {
    return undefined;
  }

  const inputTokens = getUsageNumber(usage, "input_tokens");
  const outputTokens = getUsageNumber(usage, "output_tokens");
  const totalTokens = getUsageNumber(usage, "total_tokens");
  const inputDetails =
    typeof (usage as { input_tokens_details?: unknown }).input_tokens_details ===
    "object"
      ? ((usage as { input_tokens_details: Record<string, unknown> })
          .input_tokens_details as Record<string, unknown>)
      : undefined;
  const outputDetails =
    typeof (usage as { output_tokens_details?: unknown }).output_tokens_details ===
    "object"
      ? ((usage as { output_tokens_details: Record<string, unknown> })
          .output_tokens_details as Record<string, unknown>)
      : undefined;
  const cachedInputTokens = inputDetails
    ? getUsageNumber(inputDetails, "cached_tokens")
    : undefined;
  const reasoningTokens = outputDetails
    ? getUsageNumber(outputDetails, "reasoning_tokens")
    : undefined;
  const uncachedInputTokens =
    typeof inputTokens === "number"
      ? Math.max(inputTokens - (cachedInputTokens ?? 0), 0)
      : undefined;

  if (
    typeof inputTokens !== "number" &&
    typeof outputTokens !== "number" &&
    typeof totalTokens !== "number" &&
    typeof cachedInputTokens !== "number" &&
    typeof reasoningTokens !== "number"
  ) {
    return undefined;
  }

  return {
    inputTokens,
    cachedInputTokens,
    uncachedInputTokens,
    outputTokens,
    reasoningTokens,
    totalTokens,
  };
}

function getUsageNumber(source: Record<string, unknown> | object, key: string) {
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
