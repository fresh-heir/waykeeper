import type {
  PlannerAiDraftResponse,
  PlannerAiParseResponse,
  PlannerAiReplanResponse,
  PlannerAiRouteFailure,
  PlannerAiRouteRequest,
  PlannerAiRouteResponse,
  PlannerAiRouteSuccess,
  PlannerAiFlow,
} from "@/app/_lib/planner/ai/types";

async function postPlannerAi(
  request: PlannerAiRouteRequest,
  options?: {
    signal?: AbortSignal;
  }
): Promise<PlannerAiRouteResponse> {
  try {
    const response = await fetch("/api/planner/ai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal: options?.signal,
    });
    const data = (await response.json()) as PlannerAiRouteResponse;

    if (!response.ok) {
      return {
        ok: false,
        error:
          (data as PlannerAiRouteFailure).error ??
          "The AI planner route returned an unexpected response.",
        diagnostics: data.diagnostics,
      };
    }

    return data;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        ok: false,
        aborted: true,
        error: "The AI planner request was aborted before a response was returned.",
      };
    }

    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "The AI planner request failed before a response was returned.",
    };
  }
}

export async function requestPlannerAiParse(
  request: Extract<PlannerAiRouteRequest, { flow: "parse" }>,
  options?: {
    signal?: AbortSignal;
  }
) {
  const response = await postPlannerAi(request, options);

  if (!response.ok) {
    return response;
  }

  return response as PlannerAiRouteSuccess & {
    result: PlannerAiParseResponse;
  };
}

export async function requestPlannerAiDraft(
  request: Extract<PlannerAiRouteRequest, { flow: "draft" }>,
  options?: {
    signal?: AbortSignal;
  }
) {
  const response = await postPlannerAi(request, options);

  if (!response.ok) {
    return response;
  }

  return response as PlannerAiRouteSuccess & {
    result: PlannerAiDraftResponse;
  };
}

export async function requestPlannerAiReplan(
  request: Extract<PlannerAiRouteRequest, { flow: "replan" }>,
  options?: {
    signal?: AbortSignal;
  }
) {
  const response = await postPlannerAi(request, options);

  if (!response.ok) {
    return response;
  }

  return response as PlannerAiRouteSuccess & {
    result: PlannerAiReplanResponse;
  };
}

export function getPlannerAiFailureSummary(flow: PlannerAiFlow, error: string) {
  switch (flow) {
    case "parse":
      return `AI interpretation failed: ${error}`;
    case "draft":
      return `AI draft scheduling failed: ${error} Interpreted tasks were preserved and no route was applied.`;
    case "replan":
      return `AI replanning failed: ${error}`;
  }
}
