import { NextResponse } from "next/server";

import {
  getPlannerAiResponseJsonSchema,
  getPlannerAiResponseSchema,
  getPlannerAiResponseSchemaName,
  plannerAiRouteRequestSchema,
} from "@/app/_lib/planner/ai/schemas";
import {
  buildPlannerAiSystemPrompt,
  buildPlannerAiUserPrompt,
} from "@/app/_lib/planner/ai/prompts";
import {
  buildPlannerAiProviderOptions,
  didPlannerAiHitOutputCap,
  getPlannerAiTimeoutPolicy,
  selectPlannerAiModel,
} from "@/app/_lib/planner/ai/runtime";
import type {
  PlannerAiAppliedProviderOptions,
  PlannerAiParseStrategy,
  PlannerAiRouteFailure,
  PlannerAiRouteRequest,
  PlannerAiServerDiagnostics,
  PlannerAiTokenUsageDiagnostics,
  PlannerAiTimingDiagnostics,
} from "@/app/_lib/planner/ai/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestedAt = new Date().toISOString();
  const startedAt = Date.now();
  let requestPreview: unknown = null;
  let rawResponse: unknown = null;
  let flow: PlannerAiRouteRequest["flow"] | undefined;
  let strategy: PlannerAiParseStrategy | undefined;
  let payloadBytes = 0;
  let providerOptions: PlannerAiAppliedProviderOptions | undefined;
  let tokenUsage: PlannerAiTokenUsageDiagnostics | undefined;
  let outputCapHit: boolean | undefined;
  const timings: PlannerAiTimingDiagnostics = {
    openAiFetchMs: 0,
    promptBuildMs: 0,
    requestValidationMs: 0,
    responseDecodeMs: 0,
    schemaValidationMs: 0,
    structuredOutputParseMs: 0,
  };

  try {
    const validationStartedAt = Date.now();
    const rawBody = await request.text();
    payloadBytes = new TextEncoder().encode(rawBody).byteLength;
    let body: unknown;

    try {
      body = JSON.parse(rawBody);
    } catch {
      timings.requestValidationMs = Date.now() - validationStartedAt;
      return respondWithFailure(
        {
          ok: false,
          error: "Invalid AI planner request payload.",
          diagnostics: {
            flow: "parse",
            requestedAt,
            durationMs: Date.now() - startedAt,
            payloadBytes,
            requestPreview: null,
            rawResponse: rawBody,
            schemaValidation: {
              passed: false,
              issues: ["Request body was not valid JSON."],
            },
            repairNotes: [],
            timings,
          },
        },
        400
      );
    }

    const parsedRequest = plannerAiRouteRequestSchema.safeParse(body);
    timings.requestValidationMs = Date.now() - validationStartedAt;

    if (!parsedRequest.success) {
      return respondWithFailure(
        {
          ok: false,
          error: "Invalid AI planner request payload.",
          diagnostics: {
            flow: "parse",
            requestedAt,
            durationMs: Date.now() - startedAt,
            payloadBytes,
            requestPreview: body,
            rawResponse: null,
            schemaValidation: {
              passed: false,
              issues: parsedRequest.error.issues.map((issue) => issue.message),
            },
            repairNotes: [],
            timings,
          },
        },
        400
      );
    }

    flow = parsedRequest.data.flow;
    strategy =
      parsedRequest.data.flow === "parse" ? parsedRequest.data.strategy : undefined;
    requestPreview = parsedRequest.data.payload;

    const apiKey = process.env.OPENAI_API_KEY;
    const model = selectPlannerAiModel(parsedRequest.data);
    const providerOptionSelection = buildPlannerAiProviderOptions({
      flow,
      model,
      strategy,
    });
    providerOptions = providerOptionSelection.diagnostics;
    const includeDiagnostics =
      parsedRequest.data.includeDiagnostics === true ||
      process.env.NODE_ENV !== "production";

    if (!apiKey) {
      return respondWithFailure(
        {
          ok: false,
          error: "Missing OPENAI_API_KEY for planner AI requests.",
          diagnostics: includeDiagnostics
            ? {
                flow,
                requestedAt,
                durationMs: Date.now() - startedAt,
                requestPreview,
                rawResponse: null,
                payloadBytes,
                providerOptions,
                schemaValidation: {
                  passed: false,
                  issues: ["OPENAI_API_KEY is not configured."],
                },
                repairNotes: [],
                model,
                strategy,
                timings,
                tokenUsage,
              }
            : undefined,
        },
        503
      );
    }

    const promptBuildStartedAt = Date.now();
    const openAiRequestBody = {
      model,
      input: [
        {
          role: "system",
          content: buildPlannerAiSystemPrompt(flow, {
            strategy,
          }),
        },
        {
          role: "user",
          content: buildPlannerAiUserPrompt(parsedRequest.data.payload),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: getPlannerAiResponseSchemaName(flow),
          schema: getPlannerAiResponseJsonSchema(flow),
          strict: true,
        },
      },
      ...providerOptionSelection.requestOptions,
    };
    timings.promptBuildMs = Date.now() - promptBuildStartedAt;

    const upstreamAbortController = new AbortController();
    const abortUpstream = () => {
      upstreamAbortController.abort("planner-ai-client-abort");
    };
    const upstreamTimeout = setTimeout(() => {
      upstreamAbortController.abort("planner-ai-upstream-timeout");
    }, getPlannerAiTimeoutPolicy(flow).upstreamMs);

    request.signal.addEventListener("abort", abortUpstream, { once: true });

    const openAiFetchStartedAt = Date.now();
    let openAiResponse: Response;

    try {
      openAiResponse = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(openAiRequestBody),
        signal: upstreamAbortController.signal,
      });
    } finally {
      clearTimeout(upstreamTimeout);
      request.signal.removeEventListener("abort", abortUpstream);
    }

    timings.openAiFetchMs = Date.now() - openAiFetchStartedAt;

    const responseDecodeStartedAt = Date.now();
    const openAiJson = (await openAiResponse.json()) as Record<string, unknown>;
    timings.responseDecodeMs = Date.now() - responseDecodeStartedAt;
    tokenUsage = extractTokenUsage(openAiJson);
    outputCapHit = didPlannerAiHitOutputCap({
      providerOptions,
      tokenUsage,
    });
    const outputText = extractOutputText(openAiJson);
    const refusal = extractRefusalText(openAiJson);
    rawResponse = outputText ?? refusal ?? openAiJson;

    if (!openAiResponse.ok) {
      return respondWithFailure(
        {
          ok: false,
          error: extractApiError(openAiJson),
          diagnostics: includeDiagnostics
            ? buildDiagnostics({
                durationMs: Date.now() - startedAt,
                flow,
                model,
                payloadBytes,
                providerOptions,
                rawResponse,
                repairNotes: [],
                requestPreview,
                requestedAt,
                schemaValidation: {
                  passed: false,
                  issues: [extractApiError(openAiJson)],
                },
                strategy,
                timings,
                tokenUsage,
                outputCapHit,
              })
            : undefined,
        },
        openAiResponse.status
      );
    }

    if (!outputText) {
      return respondWithFailure(
        {
          ok: false,
          error: refusal
            ? `The model refused the planner request: ${refusal}`
            : "The model did not return structured output text.",
          diagnostics: includeDiagnostics
            ? buildDiagnostics({
                durationMs: Date.now() - startedAt,
                flow,
                model,
                payloadBytes,
                providerOptions,
                rawResponse,
                repairNotes: [],
                requestPreview,
                requestedAt,
                schemaValidation: {
                  passed: false,
                  issues: refusal
                    ? [refusal]
                    : ["No structured output text was returned."],
                },
                strategy,
                timings,
                tokenUsage,
                outputCapHit,
              })
            : undefined,
        },
        502
      );
    }

    let parsedStructuredResponse: unknown;

    try {
      const structuredOutputParseStartedAt = Date.now();
      parsedStructuredResponse = JSON.parse(outputText);
      timings.structuredOutputParseMs = Date.now() - structuredOutputParseStartedAt;
      rawResponse = parsedStructuredResponse;
    } catch {
      return respondWithFailure(
        {
          ok: false,
          error: "The model returned text, but it was not valid JSON.",
          diagnostics: includeDiagnostics
            ? buildDiagnostics({
                durationMs: Date.now() - startedAt,
                flow,
                model,
                payloadBytes,
                providerOptions,
                rawResponse,
                repairNotes: [],
                requestPreview,
                requestedAt,
                schemaValidation: {
                  passed: false,
                  issues: ["Model output could not be parsed as JSON."],
                },
                strategy,
                timings,
                tokenUsage,
                outputCapHit,
              })
            : undefined,
        },
        502
      );
    }

    const schemaValidationStartedAt = Date.now();
    const schemaValidation = getPlannerAiResponseSchema(flow).safeParse(
      parsedStructuredResponse
    );
    timings.schemaValidationMs = Date.now() - schemaValidationStartedAt;

    if (!schemaValidation.success) {
      return respondWithFailure(
        {
          ok: false,
          error: "The model returned structured JSON, but it did not match the required schema.",
          diagnostics: includeDiagnostics
            ? buildDiagnostics({
                durationMs: Date.now() - startedAt,
                flow,
                model,
                payloadBytes,
                providerOptions,
                rawResponse,
                repairNotes: [],
                requestPreview,
                requestedAt,
                schemaValidation: {
                  passed: false,
                  issues: schemaValidation.error.issues.map((issue) => issue.message),
                },
                strategy,
                timings,
                tokenUsage,
                outputCapHit,
              })
            : undefined,
        },
        422
      );
    }

    return NextResponse.json({
      ok: true,
      result: schemaValidation.data,
      diagnostics: includeDiagnostics
        ? buildDiagnostics({
            durationMs: Date.now() - startedAt,
            flow,
            model,
            payloadBytes,
            providerOptions,
            rawResponse,
            repairNotes: [],
            requestPreview,
            requestedAt,
            schemaValidation: {
              passed: true,
              issues: [],
            },
            strategy,
            timings,
            tokenUsage,
            outputCapHit,
          })
        : undefined,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      const abortedByClient = request.signal.aborted;

      return respondWithFailure(
        {
          ok: false,
          aborted: true,
          error: abortedByClient
            ? "The planner AI request was aborted before completion."
            : "The planner AI request timed out before a structured response was returned.",
          diagnostics:
            flow && process.env.NODE_ENV !== "production"
              ? buildDiagnostics({
                  durationMs: Date.now() - startedAt,
                  flow,
                  payloadBytes,
                  providerOptions,
                  rawResponse,
                  repairNotes: [],
                  requestPreview,
                  requestedAt,
                  schemaValidation: {
                    passed: false,
                    issues: [
                      abortedByClient
                        ? "Client aborted the planner AI request."
                        : "Upstream planner AI request timed out.",
                    ],
                  },
                  strategy,
                  timings,
                  tokenUsage,
                  outputCapHit,
                })
              : undefined,
        },
        abortedByClient ? 499 : 504
      );
    }

    return respondWithFailure(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unexpected planner AI route failure.",
        diagnostics:
          flow && process.env.NODE_ENV !== "production"
            ? buildDiagnostics({
                durationMs: Date.now() - startedAt,
                flow,
                payloadBytes,
                providerOptions,
                requestPreview,
                rawResponse,
                repairNotes: [],
                requestedAt,
                schemaValidation: {
                  passed: false,
                  issues: [
                    error instanceof Error
                      ? error.message
                      : "Unexpected planner AI route failure.",
                  ],
                },
                strategy,
                timings,
                tokenUsage,
                outputCapHit,
              })
            : undefined,
      },
      500
    );
  }
}

function respondWithFailure(failure: PlannerAiRouteFailure, status: number) {
  return NextResponse.json(failure, {
    status,
  });
}

function buildDiagnostics({
  durationMs,
  flow,
  model,
  payloadBytes,
  providerOptions,
  rawResponse,
  repairNotes,
  requestPreview,
  requestedAt,
  schemaValidation,
  strategy,
  timings,
  tokenUsage,
  outputCapHit,
}: Omit<PlannerAiServerDiagnostics, "error">) {
  return {
    flow,
    requestedAt,
    durationMs,
    model,
    payloadBytes,
    providerOptions,
    tokenUsage,
    outputCapHit,
    requestPreview,
    rawResponse,
    schemaValidation,
    repairNotes,
    strategy,
    timings,
  } satisfies PlannerAiServerDiagnostics;
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

function extractRefusalText(response: Record<string, unknown>) {
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
        (contentItem as { type?: unknown }).type === "refusal" &&
        typeof (contentItem as { refusal?: unknown }).refusal === "string"
      ) {
        return (contentItem as { refusal: string }).refusal;
      }
    }
  }

  return null;
}

function extractApiError(response: Record<string, unknown>) {
  const error = response.error;

  if (
    error &&
    typeof error === "object" &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  return "The OpenAI planner request failed.";
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

function getUsageNumber(
  source: Record<string, unknown> | object,
  key: string
) {
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
