import { z } from "zod";

import type { PlannerAiFlow } from "@/app/_lib/planner/ai/types";

const taskTypeSchema = z.enum([
  "deep_work",
  "admin",
  "chore",
  "self_care",
  "errand",
  "appointment",
  "break_candidate",
  "other",
]);

const breakModeSchema = z.enum(["restful", "productive"]);
const breakCadenceSchema = z.enum([
  "focus_25",
  "focus_45",
  "focus_50",
  "focus_90",
]);
const paceModeSchema = z.enum(["finish_sooner", "spread_out"]);
const routeLocationContextSchema = z.enum([
  "out_of_home",
  "home",
  "desk",
  "unknown",
]);
const routeCognitiveModeSchema = z.enum(["deep_focus", "light_admin", "other"]);
const prioritySchema = z.enum(["critical", "high", "medium", "low"]);
const energyLevelSchema = z.enum(["low", "medium", "high"]);
const replanModeSchema = z.enum([
  "replan_from_now",
  "keep_essentials_only",
  "gentler_remainder",
  "use_productive_breaks",
  "preserve_focus_first",
]);
const scheduleBlockTypeSchema = z.enum([
  "focus",
  "break",
  "appointment",
  "admin",
  "chore",
  "self_care",
  "buffer",
  "transition",
  "other",
]);
const scheduleBlockStatusSchema = z.enum([
  "upcoming",
  "active",
  "done",
  "skipped",
  "deferred",
  "expired",
]);
const sourceTagSchema = z.enum(["user", "ai", "mixed", "system"]);
const parseStrategySchema = z.enum(["refine", "full"]);
const carryForwardReasonSchema = z.enum([
  "overflow",
  "manual",
  "unplaced",
  "replan_overflow",
]);
const carryForwardStatusSchema = z.enum([
  "pending",
  "accepted",
  "review",
  "ignored",
  "consumed",
]);
const unplacedTaskReasonSchema = z.enum([
  "did_not_fit_today",
  "lower_priority_deferred",
  "needs_longer_open_slot",
]);
const dueWarningKindSchema = z.enum(["scheduled_late", "carried_forward_late"]);
const plannerAiRouteFlowContextSchema = z
  .object({
    locationContext: routeLocationContextSchema,
    cognitiveMode: routeCognitiveModeSchema,
  })
  .strict();

export const plannerAiTaskSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    rawText: z.string().optional(),
    type: taskTypeSchema,
    estimatedMinutes: z.number().int().positive(),
    priority: prioritySchema,
    mustDoToday: z.boolean(),
    breakEligible: z.boolean(),
    splittable: z.boolean(),
    deferrable: z.boolean(),
    deferCount: z.number().int().min(0).optional(),
    delayedCount: z.number().int().min(0).optional(),
    energyLevel: energyLevelSchema,
    dueAt: z.string().optional(),
    hardStartTime: z.string().optional(),
    hardEndTime: z.string().optional(),
    carryForward: z.boolean().optional(),
    carriedFromDate: z.string().optional(),
    carryForwardReason: carryForwardReasonSchema.optional(),
    carryForwardStatus: carryForwardStatusSchema.optional(),
    notes: z.string().optional(),
    source: sourceTagSchema.optional(),
  })
  .strict();

const plannerAiResponseTaskSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    rawText: z.string().nullish(),
    type: taskTypeSchema,
    estimatedMinutes: z.number().int().positive(),
    priority: prioritySchema,
    mustDoToday: z.boolean(),
    breakEligible: z.boolean(),
    splittable: z.boolean(),
    deferrable: z.boolean(),
    deferCount: z.number().int().min(0).nullish(),
    delayedCount: z.number().int().min(0).nullish(),
    energyLevel: energyLevelSchema,
    dueAt: z.string().nullish(),
    beforeTaskIds: z.array(z.string().min(1)).nullish(),
    hardStartTime: z.string().nullish(),
    hardEndTime: z.string().nullish(),
    carryForward: z.boolean().nullish(),
    carriedFromDate: z.string().nullish(),
    carryForwardReason: carryForwardReasonSchema.nullish(),
    carryForwardStatus: carryForwardStatusSchema.nullish(),
    notes: z.string().nullish(),
    source: sourceTagSchema.nullish(),
    timeAffinityLabel: z.string().min(1).nullish(),
  })
  .strict();

export const plannerAiPayloadTaskSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    type: taskTypeSchema,
    estimatedMinutes: z.number().int().positive(),
    priority: prioritySchema,
    mustDoToday: z.boolean(),
    breakEligible: z.boolean(),
    splittable: z.boolean(),
    deferrable: z.boolean(),
    energyLevel: energyLevelSchema,
    dueAt: z.string().optional(),
    beforeTaskIds: z.array(z.string().min(1)).optional(),
    hardStartTime: z.string().optional(),
    hardEndTime: z.string().optional(),
    carryForward: z.boolean().optional(),
    carriedFromDate: z.string().optional(),
    carryForwardStatus: carryForwardStatusSchema.optional(),
    routeContext: plannerAiRouteFlowContextSchema.optional(),
    timeAffinityLabel: z.string().min(1).optional(),
  })
  .strict();

export const plannerAiHardEventSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    startTime: z.string().min(1),
    endTime: z.string().min(1),
    locked: z.literal(true),
  })
  .strict();

export const plannerAiPlanningWindowSchema = z
  .object({
    startTime: z.string().min(1),
    endTime: z.string().min(1),
  })
  .strict();

const plannerAiUnplacedTaskSchema = z
  .object({
    taskId: z.string().min(1),
    reason: unplacedTaskReasonSchema,
  })
  .strict();

const plannerAiDueWarningSchema = z
  .object({
    taskId: z.string().min(1),
    kind: dueWarningKindSchema,
  })
  .strict();

export const plannerAiScheduleBlockSchema = z
  .object({
    id: z.string().min(1),
    taskId: z.string().min(1).optional(),
    blockType: scheduleBlockTypeSchema,
    startTime: z.string().min(1),
    endTime: z.string().min(1),
    status: scheduleBlockStatusSchema.optional(),
    locked: z.boolean(),
  })
  .strict();

const plannerAiTaskSnapshotSchema = plannerAiPayloadTaskSchema.partial().strict();
const plannerAiBlockSnapshotSchema = plannerAiScheduleBlockSchema.partial().strict();

const plannerAiTaskDeltaSchema = z
  .object({
    taskId: z.string().min(1),
    changeType: z.enum(["added", "removed", "updated"]),
    changedFields: z.array(z.string().min(1)),
    before: plannerAiTaskSnapshotSchema.nullable(),
    after: plannerAiTaskSnapshotSchema.nullable(),
  })
  .strict();

const plannerAiBlockDeltaSchema = z
  .object({
    blockId: z.string().min(1),
    changeType: z.enum(["added", "removed", "updated"]),
    changedFields: z.array(z.string().min(1)),
    before: plannerAiBlockSnapshotSchema.nullable(),
    after: plannerAiBlockSnapshotSchema.nullable(),
  })
  .strict();

const plannerAiDraftLocalScaffoldSchema = z
  .object({
    blocks: z.array(plannerAiScheduleBlockSchema),
    unplacedTasks: z.array(plannerAiUnplacedTaskSchema),
    carryForwardTaskIds: z.array(z.string().min(1)),
    dueWarnings: z.array(plannerAiDueWarningSchema),
    warnings: z.array(z.string()),
    qualityHints: z.array(z.string()),
  })
  .strict();

const plannerAiReplanLocalScaffoldSchema = z
  .object({
    blocks: z.array(plannerAiScheduleBlockSchema),
    carryForwardTaskIds: z.array(z.string().min(1)),
    dueWarnings: z.array(plannerAiDueWarningSchema),
    warnings: z.array(z.string()),
    summaryLines: z.array(z.string()),
    qualityHints: z.array(z.string()),
  })
  .strict();

const plannerAiAcceptedDraftProposalSchema = z
  .object({
    taskIds: z.array(z.string().min(1)),
    blockIds: z.array(z.string().min(1)),
    warnings: z.array(z.string()).optional(),
    summary: z.string().optional(),
    oracleAdvice: z.array(z.string()).optional(),
  })
  .strict();

const plannerAiAcceptedReplanProposalSchema = z
  .object({
    blockIds: z.array(z.string().min(1)),
    droppedTaskIds: z.array(z.string().min(1)).optional(),
    carryForwardTaskIds: z.array(z.string().min(1)).optional(),
    warnings: z.array(z.string()).optional(),
    summary: z.string().optional(),
    oracleAdvice: z.array(z.string()).optional(),
  })
  .strict();

const plannerAiResponseScheduleBlockSchema = z
  .object({
    id: z.string().min(1).nullish(),
    taskId: z.string().min(1).nullish(),
    title: z.string().min(1).nullish(),
    blockType: scheduleBlockTypeSchema,
    startTime: z.string().min(1),
    endTime: z.string().min(1),
    status: scheduleBlockStatusSchema.nullish(),
    locked: z.boolean().nullish(),
    source: sourceTagSchema.nullish(),
    isBreakEligibleTaskPlacement: z.boolean().nullish(),
    notes: z.string().nullish(),
  })
  .strict();

export const plannerAiParsePayloadSchema = z
  .object({
    rawText: z.string(),
    planningWindow: plannerAiPlanningWindowSchema,
    breakMode: breakModeSchema,
    baselineTasks: z.array(plannerAiPayloadTaskSchema),
    inferredHardEvents: z.array(plannerAiHardEventSchema).optional(),
  })
  .strict();

export const plannerAiDraftPayloadSchema = z
  .object({
    currentTime: z.string().min(1),
    planningWindow: plannerAiPlanningWindowSchema,
    breakMode: breakModeSchema,
    breakCadence: breakCadenceSchema,
    paceMode: paceModeSchema,
    tasks: z.array(plannerAiPayloadTaskSchema),
    hardEvents: z.array(plannerAiHardEventSchema),
    localScaffold: plannerAiDraftLocalScaffoldSchema,
    previousAcceptedAiProposal: plannerAiAcceptedDraftProposalSchema.optional(),
    changedTaskIds: z.array(z.string().min(1)).optional(),
    taskDeltas: z.array(plannerAiTaskDeltaSchema).optional(),
  })
  .strict();

export const plannerAiReplanPayloadSchema = z
  .object({
    currentTime: z.string().min(1),
    planningWindow: plannerAiPlanningWindowSchema,
    breakMode: breakModeSchema,
    breakCadence: breakCadenceSchema,
    paceMode: paceModeSchema,
    replanMode: replanModeSchema,
    tasks: z.array(plannerAiPayloadTaskSchema),
    currentBlocks: z.array(plannerAiScheduleBlockSchema),
    completedBlockIds: z.array(z.string().min(1)),
    remainingTaskIds: z.array(z.string().min(1)),
    hardEvents: z.array(plannerAiHardEventSchema),
    localScaffold: plannerAiReplanLocalScaffoldSchema,
    previousAcceptedAiProposal: plannerAiAcceptedReplanProposalSchema.optional(),
    changedTaskIds: z.array(z.string().min(1)).optional(),
    taskDeltas: z.array(plannerAiTaskDeltaSchema).optional(),
    changedBlockIds: z.array(z.string().min(1)).optional(),
    blockDeltas: z.array(plannerAiBlockDeltaSchema).optional(),
  })
  .strict();

export const plannerAiParseResponseSchema = z
  .object({
    tasks: z.array(plannerAiResponseTaskSchema),
    warnings: z.array(z.string()).nullish(),
    followUpQuestions: z.array(z.string()).nullish(),
  })
  .strict();

export const plannerAiDraftResponseSchema = z
  .object({
    tasks: z.array(plannerAiResponseTaskSchema).nullish(),
    blocks: z.array(plannerAiResponseScheduleBlockSchema),
    warnings: z.array(z.string()).nullish(),
    summary: z.string().nullish(),
    oracleAdvice: z.array(z.string()).nullish(),
  })
  .strict();

export const plannerAiReplanResponseSchema = z
  .object({
    blocks: z.array(plannerAiResponseScheduleBlockSchema),
    droppedTaskIds: z.array(z.string().min(1)).nullish(),
    carryForwardTaskIds: z.array(z.string().min(1)).nullish(),
    warnings: z.array(z.string()).nullish(),
    summary: z.string().nullish(),
    oracleAdvice: z.array(z.string()).nullish(),
  })
  .strict();

export const plannerAiRouteRequestSchema = z.discriminatedUnion("flow", [
  z
    .object({
      flow: z.literal("parse"),
      includeDiagnostics: z.boolean().optional(),
      strategy: parseStrategySchema,
      payload: plannerAiParsePayloadSchema,
    })
    .strict(),
  z
    .object({
      flow: z.literal("draft"),
      includeDiagnostics: z.boolean().optional(),
      payload: plannerAiDraftPayloadSchema,
    })
    .strict(),
  z
    .object({
      flow: z.literal("replan"),
      includeDiagnostics: z.boolean().optional(),
      payload: plannerAiReplanPayloadSchema,
    })
    .strict(),
]);

export function getPlannerAiResponseSchema(flow: PlannerAiFlow) {
  switch (flow) {
    case "parse":
      return plannerAiParseResponseSchema;
    case "draft":
      return plannerAiDraftResponseSchema;
    case "replan":
      return plannerAiReplanResponseSchema;
  }
}

export function getPlannerAiResponseSchemaName(flow: PlannerAiFlow) {
  switch (flow) {
    case "parse":
      return "waykeeper_parse_response";
    case "draft":
      return "waykeeper_draft_schedule_response";
    case "replan":
      return "waykeeper_replan_response";
  }
}

export function getPlannerAiResponseJsonSchema(flow: PlannerAiFlow) {
  return toOpenAiStrictJsonSchema(
    z.toJSONSchema(getPlannerAiResponseSchema(flow)) as unknown as JsonSchema
  );
}

type JsonSchema =
  | boolean
  | {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema | JsonSchema[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  additionalProperties?: boolean | JsonSchema;
  [key: string]: unknown;
};

function toOpenAiStrictJsonSchema(schema: JsonSchema): JsonSchema {
  const clone = structuredClone(schema) as JsonSchema;
  return normalizeOpenAiSchemaNode(clone);
}

function normalizeOpenAiSchemaNode(schema: JsonSchema): JsonSchema {
  if (typeof schema === "boolean") {
    return schema;
  }

  if (schema.properties) {
    const propertyEntries = Object.entries(schema.properties);
    const originalRequired = new Set(schema.required ?? []);

    schema.properties = Object.fromEntries(
      propertyEntries.map(([key, value]) => {
        const normalizedValue = normalizeOpenAiSchemaNode(value);

        return [
          key,
          originalRequired.has(key)
            ? normalizedValue
            : makeSchemaNullable(normalizedValue),
        ];
      })
    );
    schema.required = propertyEntries.map(([key]) => key);
    schema.additionalProperties = false;
  }

  if (schema.items) {
    schema.items = Array.isArray(schema.items)
      ? schema.items.map((entry) => normalizeOpenAiSchemaNode(entry))
      : normalizeOpenAiSchemaNode(schema.items);
  }

  if (schema.anyOf) {
    schema.anyOf = schema.anyOf.map((entry) => normalizeOpenAiSchemaNode(entry));
  }

  if (schema.oneOf) {
    schema.oneOf = schema.oneOf.map((entry) => normalizeOpenAiSchemaNode(entry));
  }

  if (schema.allOf) {
    schema.allOf = schema.allOf.map((entry) => normalizeOpenAiSchemaNode(entry));
  }

  return schema;
}

function makeSchemaNullable(schema: JsonSchema): JsonSchema {
  if (typeof schema === "boolean") {
    return {
      anyOf: [{}, { type: "null" }],
    };
  }

  if (
    schema.anyOf?.some(
      (entry) => typeof entry !== "boolean" && entry.type === "null"
    )
  ) {
    return schema;
  }

  return {
    anyOf: [schema, { type: "null" }],
  };
}
