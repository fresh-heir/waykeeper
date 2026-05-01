import {
  buildPreviewHardEvents,
  buildPreviewPlanningWindow,
  createDaySetupDraft,
  createDraftFixedEvent,
  createEmptyDaySetupErrors,
  createEmptyDaySetupWarnings,
  getActivePlannerInputText,
  getIntakeFlowContext,
  hasBlockingErrors,
  validateDaySetupDraft,
  type DaySetupDraft,
  type DaySetupInputMode,
  type DaySetupErrors,
  type DaySetupWarnings,
  type DraftFixedEvent,
  type IntakeFlowContext,
  type PlannerStage,
} from "@/app/_lib/intake-flow";
import type { PlannerCsvImportResult } from "@/app/_lib/planner/csv-intake";
import type { PlannerDevScenario } from "@/app/_lib/planner/dev-scenarios";
import {
  addMinutesWithOffset,
  toIsoDateTimeFromLocalInput,
} from "@/app/_lib/planner/date-time";
import { interpretDaySetup } from "@/app/_lib/planner/interpret";
import { analyzeRouteFlowSequence } from "@/app/_lib/planner/route-flow";
import {
  createTaskFromCarryForwardItem,
  deriveCarryForwardLateWarnings,
  deriveScheduledDueWarnings,
  normalizeCarryForwardItemsForDayPlan,
} from "@/app/_lib/planner/carry-forward";
import {
  delayDayPlanBlock,
  normalizeUnplacedTasksForDayPlan,
  markDayPlanBlockComplete,
  generateDraftSchedule,
  preserveExecutionHistoryOnRebuild,
  skipDayPlanBlock,
  synchronizeDayPlanToCurrentTime,
  togglePastDayPlanBlockComplete,
} from "@/app/_lib/planner/scheduler";
import {
  validateFixedTimeTaskConstraint,
  validateGeneratedDayPlan,
  validateReplannedDayPlan,
} from "@/app/_lib/planner/validation";
import {
  DEFAULT_BREAK_CADENCE,
  DEFAULT_PACE_MODE,
  normalizeBreakCadence,
  normalizePaceMode,
} from "@/app/_lib/planner-types";
import type {
  BreakCadence,
  BreakMode,
  CarryForwardItem,
  DayPlan,
  DraftScheduleResponse,
  HardEvent,
  MockPlannerState,
  PaceMode,
  ParsedTaskResponse,
  ReplanMode,
  ReplanPreview,
  Task,
} from "@/app/_lib/planner-types";

const STORAGE_KEY = "waykeeper-milestone-3-planner";
const ACTIVE_DRAFT_STORAGE_KEY = "waykeeper-active-plan-draft";
const DRAFT_LIBRARY_STORAGE_KEY = "waykeeper-plan-drafts";

export type PlannerTimeMode = "live" | "manual";

export interface PlannerStoreState {
  stage: PlannerStage;
  intakeDraft: DaySetupDraft;
  intakeCarryForwardItems: CarryForwardItem[];
  errors: DaySetupErrors;
  warnings: DaySetupWarnings;
  parsedTaskResponse: ParsedTaskResponse | null;
  draftScheduleResponse: DraftScheduleResponse | null;
  plannerWarnings: string[];
  routeHonestyWarnings: string[];
  oracleAdvice: string[];
}

interface PersistedPlannerState {
  draftScheduleResponse: DraftScheduleResponse | null;
  intakeDraft: DaySetupDraft;
  intakeCarryForwardItems: CarryForwardItem[];
  parsedTaskResponse: ParsedTaskResponse | null;
  plannerWarnings: string[];
  routeHonestyWarnings: string[];
  oracleAdvice: string[];
  stage: PlannerStage;
  warnings: DaySetupWarnings;
}

interface PersistedPlannerSessionRecord {
  plannerCurrentTime?: string;
  plannerState: PersistedPlannerState;
  plannerTimeMode?: PlannerTimeMode;
  selectedReplanMode?: ReplanMode;
  selectedScenarioId?: string;
}

export interface PersistedPlannerSession {
  plannerCurrentTime?: string;
  plannerState: PlannerStoreState;
  plannerTimeMode?: PlannerTimeMode;
  selectedReplanMode?: ReplanMode;
  selectedScenarioId?: string;
}

interface PersistedPlannerDraftRecord {
  createdAt: string;
  id: string;
  session: PersistedPlannerSessionRecord;
  subtitle: string;
  title: string;
  updatedAt: string;
}

interface PersistedPlannerDraftLibrary {
  drafts: PersistedPlannerDraftRecord[];
  version: 1;
}

export interface PlannerDraftSummary {
  createdAt: string;
  hasRoute: boolean;
  id: string;
  stage: PlannerStage;
  subtitle: string;
  title: string;
  updatedAt: string;
}

export function createPlannerStoreState(planner: MockPlannerState): PlannerStoreState {
  return {
    stage: "day_setup",
    intakeDraft: createDaySetupDraft(planner),
    intakeCarryForwardItems: [],
    errors: createEmptyDaySetupErrors(),
    warnings: createEmptyDaySetupWarnings(),
    parsedTaskResponse: null,
    draftScheduleResponse: null,
    plannerWarnings: [],
    routeHonestyWarnings: [],
    oracleAdvice: [],
  };
}

export function loadPlannerStoreState(
  planner: MockPlannerState
): PersistedPlannerSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);

    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue) as Partial<
      PersistedPlannerState & PersistedPlannerSessionRecord
    >;
    const persistedPlannerState = isPersistedPlannerState(parsedValue)
      ? parsedValue
      : isPersistedPlannerSessionRecord(parsedValue)
        ? parsedValue.plannerState
        : null;

    if (!persistedPlannerState) {
      return null;
    }

    const persistedCurrentTime =
      isPersistedPlannerSessionRecord(parsedValue) &&
      typeof parsedValue.plannerCurrentTime === "string"
        ? parsedValue.plannerCurrentTime
        : planner.currentTime;
    const normalizedDraftScheduleResponse = persistedPlannerState.draftScheduleResponse
      ? normalizeDraftScheduleResponse(
          persistedPlannerState.draftScheduleResponse,
          persistedCurrentTime
        )
      : null;
    const hydrationValidationWarnings = normalizedDraftScheduleResponse
      ? validateGeneratedDayPlan(normalizedDraftScheduleResponse.dayPlan, {
          currentTime: persistedCurrentTime,
          allowProductiveBreaks:
            normalizedDraftScheduleResponse.dayPlan.breakMode === "productive",
          carryForwardItems: normalizedDraftScheduleResponse.carryForwardItems,
          dueWarnings: normalizedDraftScheduleResponse.dueWarnings,
          unplacedTasks: normalizedDraftScheduleResponse.unplacedTasks,
        }).warnings
      : [];
    const routeMessaging = normalizedDraftScheduleResponse
      ? deriveRouteMessaging({
          currentTime: persistedCurrentTime,
          draftScheduleResponse: normalizedDraftScheduleResponse,
          validationWarnings: hydrationValidationWarnings,
        })
      : {
          routeHonestyWarnings: [] as string[],
          oracleAdvice: [] as string[],
        };

    return {
      plannerCurrentTime:
        isPersistedPlannerSessionRecord(parsedValue) &&
        typeof parsedValue.plannerCurrentTime === "string"
          ? parsedValue.plannerCurrentTime
          : undefined,
      plannerState: {
        stage: persistedPlannerState.stage,
        intakeDraft: {
          ...persistedPlannerState.intakeDraft,
          csvText: persistedPlannerState.intakeDraft.csvText ?? "",
          profileName: persistedPlannerState.intakeDraft.profileName ?? "",
          profileJourney:
            persistedPlannerState.intakeDraft.profileJourney ?? "building",
          profilePriorities: Array.isArray(
            persistedPlannerState.intakeDraft.profilePriorities
          )
            ? persistedPlannerState.intakeDraft.profilePriorities
            : ["focus", "learning"],
          profileRhythm:
            persistedPlannerState.intakeDraft.profileRhythm ??
            "steady_builder",
          profilePreference:
            persistedPlannerState.intakeDraft.profilePreference ?? "",
          breakCadence: normalizeBreakCadence(
            persistedPlannerState.intakeDraft.breakCadence as
              | BreakCadence
              | "focus_60"
              | undefined
          ),
          inputMode: isDaySetupInputMode(
            persistedPlannerState.intakeDraft.inputMode
          )
            ? persistedPlannerState.intakeDraft.inputMode
            : "brain_dump",
          paceMode: normalizePaceMode(
            persistedPlannerState.intakeDraft.paceMode as PaceMode | undefined
          ),
        },
        intakeCarryForwardItems:
          persistedPlannerState.intakeCarryForwardItems ?? [],
        errors: createEmptyDaySetupErrors(),
        warnings: persistedPlannerState.warnings,
        parsedTaskResponse: persistedPlannerState.parsedTaskResponse,
        draftScheduleResponse: normalizedDraftScheduleResponse,
        plannerWarnings: mergePlannerWarnings(
          persistedPlannerState.plannerWarnings,
          [
            ...(normalizedDraftScheduleResponse?.warnings ?? []),
            ...hydrationValidationWarnings,
          ]
        ),
        routeHonestyWarnings: routeMessaging.routeHonestyWarnings,
        oracleAdvice: routeMessaging.oracleAdvice,
      },
      selectedReplanMode:
        isPersistedPlannerSessionRecord(parsedValue) &&
        isReplanMode(parsedValue.selectedReplanMode)
          ? parsedValue.selectedReplanMode
          : undefined,
      plannerTimeMode:
        isPersistedPlannerSessionRecord(parsedValue) &&
        isPlannerTimeMode(parsedValue.plannerTimeMode)
          ? parsedValue.plannerTimeMode
          : undefined,
      selectedScenarioId:
        isPersistedPlannerSessionRecord(parsedValue) &&
        typeof parsedValue.selectedScenarioId === "string"
          ? parsedValue.selectedScenarioId
          : undefined,
    };
  } catch {
    return null;
  }
}

function hydratePlannerSessionRecord(
  planner: MockPlannerState,
  parsedValue: Partial<PersistedPlannerSessionRecord>
): PersistedPlannerSession | null {
  const persistedPlannerState = isPersistedPlannerSessionRecord(parsedValue)
    ? parsedValue.plannerState
    : null;

  if (!persistedPlannerState) {
    return null;
  }

  const persistedCurrentTime =
    typeof parsedValue.plannerCurrentTime === "string"
      ? parsedValue.plannerCurrentTime
      : planner.currentTime;
  const normalizedDraftScheduleResponse = persistedPlannerState.draftScheduleResponse
    ? normalizeDraftScheduleResponse(
        persistedPlannerState.draftScheduleResponse,
        persistedCurrentTime
      )
    : null;
  const hydrationValidationWarnings = normalizedDraftScheduleResponse
    ? validateGeneratedDayPlan(normalizedDraftScheduleResponse.dayPlan, {
        currentTime: persistedCurrentTime,
        allowProductiveBreaks:
          normalizedDraftScheduleResponse.dayPlan.breakMode === "productive",
        carryForwardItems: normalizedDraftScheduleResponse.carryForwardItems,
        dueWarnings: normalizedDraftScheduleResponse.dueWarnings,
        unplacedTasks: normalizedDraftScheduleResponse.unplacedTasks,
      }).warnings
    : [];
  const routeMessaging = normalizedDraftScheduleResponse
    ? deriveRouteMessaging({
        currentTime: persistedCurrentTime,
        draftScheduleResponse: normalizedDraftScheduleResponse,
        validationWarnings: hydrationValidationWarnings,
      })
    : {
        routeHonestyWarnings: [] as string[],
        oracleAdvice: [] as string[],
      };

  return {
    plannerCurrentTime:
      typeof parsedValue.plannerCurrentTime === "string"
        ? parsedValue.plannerCurrentTime
        : undefined,
    plannerState: {
      stage: persistedPlannerState.stage,
      intakeDraft: {
        ...persistedPlannerState.intakeDraft,
        csvText: persistedPlannerState.intakeDraft.csvText ?? "",
        profileName: persistedPlannerState.intakeDraft.profileName ?? "",
        profileJourney:
          persistedPlannerState.intakeDraft.profileJourney ?? "building",
        profilePriorities: Array.isArray(
          persistedPlannerState.intakeDraft.profilePriorities
        )
          ? persistedPlannerState.intakeDraft.profilePriorities
          : ["focus", "learning"],
        profileRhythm:
          persistedPlannerState.intakeDraft.profileRhythm ??
          "steady_builder",
        profilePreference:
          persistedPlannerState.intakeDraft.profilePreference ?? "",
        breakCadence: normalizeBreakCadence(
          persistedPlannerState.intakeDraft.breakCadence as
            | BreakCadence
            | "focus_60"
            | undefined
        ),
        inputMode: isDaySetupInputMode(
          persistedPlannerState.intakeDraft.inputMode
        )
          ? persistedPlannerState.intakeDraft.inputMode
          : "brain_dump",
        paceMode: normalizePaceMode(
          persistedPlannerState.intakeDraft.paceMode as PaceMode | undefined
        ),
      },
      intakeCarryForwardItems:
        persistedPlannerState.intakeCarryForwardItems ?? [],
      errors: createEmptyDaySetupErrors(),
      warnings: persistedPlannerState.warnings,
      parsedTaskResponse: persistedPlannerState.parsedTaskResponse,
      draftScheduleResponse: normalizedDraftScheduleResponse,
      plannerWarnings: mergePlannerWarnings(
        persistedPlannerState.plannerWarnings,
        [
          ...(normalizedDraftScheduleResponse?.warnings ?? []),
          ...hydrationValidationWarnings,
        ]
      ),
      routeHonestyWarnings: routeMessaging.routeHonestyWarnings,
      oracleAdvice: routeMessaging.oracleAdvice,
    },
    selectedReplanMode: isReplanMode(parsedValue.selectedReplanMode)
      ? parsedValue.selectedReplanMode
      : undefined,
    plannerTimeMode: isPlannerTimeMode(parsedValue.plannerTimeMode)
      ? parsedValue.plannerTimeMode
      : undefined,
    selectedScenarioId:
      typeof parsedValue.selectedScenarioId === "string"
        ? parsedValue.selectedScenarioId
        : undefined,
  };
}

function loadPlannerDraftLibrary(): PersistedPlannerDraftLibrary {
  if (typeof window === "undefined") {
    return {
      version: 1,
      drafts: [],
    };
  }

  try {
    const rawValue = window.localStorage.getItem(DRAFT_LIBRARY_STORAGE_KEY);

    if (!rawValue) {
      return {
        version: 1,
        drafts: [],
      };
    }

    const parsedValue = JSON.parse(rawValue) as Partial<PersistedPlannerDraftLibrary>;

    if (!Array.isArray(parsedValue.drafts)) {
      return {
        version: 1,
        drafts: [],
      };
    }

    return {
      version: 1,
      drafts: parsedValue.drafts.filter(isPersistedPlannerDraftRecord),
    };
  } catch {
    return {
      version: 1,
      drafts: [],
    };
  }
}

function savePlannerDraftLibrary(library: PersistedPlannerDraftLibrary) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(DRAFT_LIBRARY_STORAGE_KEY, JSON.stringify(library));
}

function upsertPlannerDraft(
  draftId: string,
  session: PersistedPlannerSessionRecord
) {
  const library = loadPlannerDraftLibrary();
  const existingDraft = library.drafts.find((draft) => draft.id === draftId);
  const now = new Date().toISOString();
  const metadata = getDraftMetadata(session);
  const nextDraft: PersistedPlannerDraftRecord = {
    createdAt: existingDraft?.createdAt ?? now,
    id: draftId,
    session,
    subtitle: metadata.subtitle,
    title: metadata.title,
    updatedAt: now,
  };
  const nextDrafts = [
    nextDraft,
    ...library.drafts.filter((draft) => draft.id !== draftId),
  ].slice(0, 12);

  savePlannerDraftLibrary({
    version: 1,
    drafts: nextDrafts,
  });
}

function getDraftMetadata(session: PersistedPlannerSessionRecord) {
  const draft = session.plannerState.intakeDraft;
  const route = session.plannerState.draftScheduleResponse;
  const date =
    route?.dayPlan.date ??
    session.plannerCurrentTime?.slice(0, 10) ??
    draft.planningStart.slice(0, 10);
  const dateLabel = formatDraftDateLabel(date);
  const owner = draft.profileName.trim();
  const title = owner ? `${owner}'s ${dateLabel} route` : `${dateLabel} route`;
  const taskCount =
    route?.dayPlan.tasks.length ?? session.plannerState.parsedTaskResponse?.tasks.length;
  const subtitleParts = [
    route ? "Built route" : "Draft setup",
    typeof taskCount === "number" ? `${taskCount} tasks` : null,
  ].filter(Boolean);

  return {
    title,
    subtitle: subtitleParts.join(" · "),
  };
}

function formatDraftDateLabel(date: string) {
  const parsedDate = new Date(`${date}T12:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return "Saved plan";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(parsedDate);
}

export function createPlannerDraftId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `draft-${crypto.randomUUID()}`;
  }

  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getActivePlannerDraftId() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(ACTIVE_DRAFT_STORAGE_KEY);
}

export function setActivePlannerDraftId(draftId: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  if (draftId) {
    window.localStorage.setItem(ACTIVE_DRAFT_STORAGE_KEY, draftId);
    return;
  }

  window.localStorage.removeItem(ACTIVE_DRAFT_STORAGE_KEY);
}

export function loadPlannerDraftSummaries(): PlannerDraftSummary[] {
  return loadPlannerDraftLibrary().drafts.map((draft) => ({
    createdAt: draft.createdAt,
    hasRoute: Boolean(draft.session.plannerState.draftScheduleResponse),
    id: draft.id,
    stage: draft.session.plannerState.stage,
    subtitle: draft.subtitle,
    title: draft.title,
    updatedAt: draft.updatedAt,
  }));
}

export function loadPlannerDraftSession(
  planner: MockPlannerState,
  draftId: string
): PersistedPlannerSession | null {
  const draft = loadPlannerDraftLibrary().drafts.find(
    (entry) => entry.id === draftId
  );

  if (!draft) {
    return null;
  }

  return hydratePlannerSessionRecord(planner, draft.session);
}

export function deletePlannerDraft(draftId: string) {
  const library = loadPlannerDraftLibrary();
  const nextDrafts = library.drafts.filter((draft) => draft.id !== draftId);

  savePlannerDraftLibrary({
    version: 1,
    drafts: nextDrafts,
  });

  if (getActivePlannerDraftId() === draftId) {
    setActivePlannerDraftId(nextDrafts[0]?.id ?? null);
  }

  return nextDrafts.map((draft) => ({
    createdAt: draft.createdAt,
    hasRoute: Boolean(draft.session.plannerState.draftScheduleResponse),
    id: draft.id,
    stage: draft.session.plannerState.stage,
    subtitle: draft.subtitle,
    title: draft.title,
    updatedAt: draft.updatedAt,
  }));
}

export function persistPlannerStoreState(
  state: PlannerStoreState,
  options?: {
    activeDraftId?: string;
    plannerCurrentTime?: string;
    plannerTimeMode?: PlannerTimeMode;
    selectedReplanMode?: ReplanMode;
    selectedScenarioId?: string;
  }
) {
  if (typeof window === "undefined") {
    return;
  }

  const persistableState: PersistedPlannerState = {
    stage: state.stage,
    intakeDraft: state.intakeDraft,
    intakeCarryForwardItems: state.intakeCarryForwardItems,
    warnings: state.warnings,
    parsedTaskResponse: state.parsedTaskResponse,
    draftScheduleResponse: state.draftScheduleResponse,
    plannerWarnings: state.plannerWarnings,
    routeHonestyWarnings: state.routeHonestyWarnings,
    oracleAdvice: state.oracleAdvice,
  };

  const persistableSession: PersistedPlannerSessionRecord = {
    plannerCurrentTime: options?.plannerCurrentTime,
    plannerState: persistableState,
    plannerTimeMode: options?.plannerTimeMode,
    selectedReplanMode: options?.selectedReplanMode,
    selectedScenarioId: options?.selectedScenarioId,
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persistableSession));

  if (options?.activeDraftId) {
    upsertPlannerDraft(options.activeDraftId, persistableSession);
  }
}

export function setPlannerCurrentTime(
  state: PlannerStoreState,
  currentTime: string
): PlannerStoreState {
  if (!state.draftScheduleResponse) {
    return state;
  }

  const draftScheduleResponse = normalizeDraftScheduleResponse(
    {
      ...state.draftScheduleResponse,
      dayPlan: synchronizeDayPlanToCurrentTime(
        state.draftScheduleResponse.dayPlan,
        currentTime
      ),
    },
    currentTime
  );
  const routeMessaging = deriveRouteMessaging({
    currentTime,
    draftScheduleResponse,
    validationWarnings: [],
  });

  return {
    ...state,
    draftScheduleResponse,
    plannerWarnings: mergePlannerWarnings(
      getBasePlannerWarnings(state),
      draftScheduleResponse.warnings
    ),
    routeHonestyWarnings: routeMessaging.routeHonestyWarnings,
    oracleAdvice: routeMessaging.oracleAdvice,
  };
}

export function commitReplanPreview(
  state: PlannerStoreState,
  preview: ReplanPreview,
  currentTime: string
): PlannerStoreState {
  if (state.stage !== "draft_route" || !state.draftScheduleResponse) {
    return state;
  }

  const validation = validateReplannedDayPlan({
    currentTime,
    nextDayPlan: preview.dayPlan,
    previousDayPlan: state.draftScheduleResponse.dayPlan,
    allowProductiveBreaks:
      state.draftScheduleResponse.dayPlan.breakMode === "productive" ||
      preview.mode === "use_productive_breaks",
    carryForwardItems: preview.carryForwardItems,
    dueWarnings: preview.dueWarnings,
    unplacedTasks: preview.unplacedTasks,
  });

  if (!validation.isValid) {
    return {
      ...state,
      plannerWarnings: mergePlannerWarnings(
        getBasePlannerWarnings(state),
        validation.warnings
      ),
    };
  }

  const draftScheduleResponse = normalizeDraftScheduleResponse(
    {
      ...state.draftScheduleResponse,
      carryForwardItems: preview.carryForwardItems,
      carryForwardTaskIds: preview.carryForwardTaskIds,
      dayPlan: preview.dayPlan,
      dueWarnings: preview.dueWarnings,
      unplacedTasks: preview.unplacedTasks,
      warnings: preview.warnings,
      oracleAdvice: preview.oracleAdvice,
    },
    currentTime
  );
  const routeMessaging = deriveRouteMessaging({
    currentTime,
    draftScheduleResponse,
    validationWarnings: [],
  });

  return {
    ...state,
    draftScheduleResponse,
    plannerWarnings: state.parsedTaskResponse?.warnings ?? [],
    routeHonestyWarnings: routeMessaging.routeHonestyWarnings,
    oracleAdvice: routeMessaging.oracleAdvice,
  };
}

export function loadPlannerDevScenario(
  state: PlannerStoreState,
  context: IntakeFlowContext,
  scenario: PlannerDevScenario
): PlannerStoreState {
  const intakeDraft: DaySetupDraft = {
    csvText: "",
    inputMode: "brain_dump",
    rawText: scenario.rawText,
    profileName: "",
    profileJourney: "building",
    profilePriorities: ["focus", "learning"],
    profileRhythm: "steady_builder",
    profilePreference: "",
    planningStart: scenario.planningStart,
    planningEnd: scenario.planningEnd,
    breakMode: scenario.breakMode,
    breakCadence: scenario.breakCadence ?? DEFAULT_BREAK_CADENCE,
    paceMode: scenario.paceMode ?? DEFAULT_PACE_MODE,
    fixedEvents: scenario.fixedEvents.map((event, index) => ({
      id: `dev-scenario-${scenario.id}-fixed-event-${index + 1}`,
      title: event.title,
      startTime: event.startTime,
      endTime: event.endTime,
      note: event.note ?? "",
    })),
  };
  const validation = validateDaySetupDraft(intakeDraft, context);

  return {
    ...state,
    stage: "day_setup",
    intakeDraft,
    intakeCarryForwardItems: [],
    errors: validation.errors,
    warnings: validation.warnings,
    parsedTaskResponse: null,
    draftScheduleResponse: null,
    plannerWarnings: [],
    routeHonestyWarnings: [],
    oracleAdvice: [],
  };
}

export function updatePlannerDraft(
  state: PlannerStoreState,
  context: IntakeFlowContext,
  updater: (draft: DaySetupDraft) => DaySetupDraft,
  options?: {
    preserveParsedResponse?: boolean;
    preserveStageWhenParsedResponse?: boolean;
  }
): PlannerStoreState {
  const nextDraft = updater(state.intakeDraft);
  const validation = validateDaySetupDraft(nextDraft, context);
  const preserveParsedResponse = options?.preserveParsedResponse ?? false;
  const preserveStageWhenParsedResponse =
    options?.preserveStageWhenParsedResponse ?? false;
  const parsedTaskResponse = preserveParsedResponse ? state.parsedTaskResponse : null;
  const nextStage =
    preserveParsedResponse &&
    preserveStageWhenParsedResponse &&
    state.stage !== "day_setup"
      ? "interpretation"
      : "day_setup";

  return {
    ...state,
    stage: nextStage,
    intakeDraft: nextDraft,
    intakeCarryForwardItems: state.intakeCarryForwardItems,
    errors: validation.errors,
    warnings: validation.warnings,
    parsedTaskResponse,
    draftScheduleResponse: null,
    plannerWarnings: parsedTaskResponse?.warnings ?? [],
    routeHonestyWarnings: [],
    oracleAdvice: [],
  };
}

export function addFixedEvent(
  state: PlannerStoreState,
  context: IntakeFlowContext
): PlannerStoreState {
  return updatePlannerDraft(
    state,
    context,
    (draft) => ({
      ...draft,
      fixedEvents: [...draft.fixedEvents, createDraftFixedEvent()],
    }),
    {
      preserveParsedResponse: true,
    }
  );
}

export function updateFixedEvent(
  state: PlannerStoreState,
  context: IntakeFlowContext,
  eventId: string,
  field: keyof DraftFixedEvent,
  value: string
): PlannerStoreState {
  return updatePlannerDraft(
    state,
    context,
    (draft) => ({
      ...draft,
      fixedEvents: draft.fixedEvents.map((event) =>
        event.id === eventId ? { ...event, [field]: value } : event
      ),
    }),
    {
      preserveParsedResponse: true,
    }
  );
}

export function removeFixedEvent(
  state: PlannerStoreState,
  context: IntakeFlowContext,
  eventId: string
): PlannerStoreState {
  return updatePlannerDraft(
    state,
    context,
    (draft) => ({
      ...draft,
      fixedEvents: draft.fixedEvents.filter((event) => event.id !== eventId),
    }),
    {
      preserveParsedResponse: true,
    }
  );
}

export function setProfileField(
  state: PlannerStoreState,
  context: IntakeFlowContext,
  field: "profileName" | "profileJourney" | "profileRhythm" | "profilePreference",
  value: string
): PlannerStoreState {
  return updatePlannerDraft(
    state,
    context,
    (draft) => ({
      ...draft,
      [field]: value,
    }),
    {
      preserveParsedResponse: true,
      preserveStageWhenParsedResponse: true,
    }
  );
}

export function toggleProfilePriority(
  state: PlannerStoreState,
  context: IntakeFlowContext,
  priority: string
): PlannerStoreState {
  return updatePlannerDraft(
    state,
    context,
    (draft) => {
      const currentPriorities = new Set(draft.profilePriorities);

      if (currentPriorities.has(priority)) {
        currentPriorities.delete(priority);
      } else if (currentPriorities.size < 3) {
        currentPriorities.add(priority);
      }

      return {
        ...draft,
        profilePriorities: Array.from(currentPriorities),
      };
    },
    {
      preserveParsedResponse: true,
      preserveStageWhenParsedResponse: true,
    }
  );
}

export function setRawText(
  state: PlannerStoreState,
  context: IntakeFlowContext,
  rawText: string
): PlannerStoreState {
  return updatePlannerDraft(state, context, (draft) => ({
    ...draft,
    inputMode: "brain_dump",
    rawText,
  }));
}

export function setCsvText(
  state: PlannerStoreState,
  context: IntakeFlowContext,
  csvText: string
): PlannerStoreState {
  const nextDraft = {
    ...state.intakeDraft,
    csvText,
    inputMode: "csv" as const,
  };
  const validation = validateDaySetupDraft(nextDraft, context);

  return {
    ...state,
    intakeDraft: nextDraft,
    errors: validation.errors,
    warnings: validation.warnings,
  };
}

export function setDaySetupInputMode(
  state: PlannerStoreState,
  context: IntakeFlowContext,
  inputMode: DaySetupInputMode
): PlannerStoreState {
  const nextDraft = {
    ...state.intakeDraft,
    inputMode,
  };
  const validation = validateDaySetupDraft(nextDraft, context);

  return {
    ...state,
    intakeDraft: nextDraft,
    errors: validation.errors,
    warnings: validation.warnings,
  };
}

export function setPlanningWindowField(
  state: PlannerStoreState,
  context: IntakeFlowContext,
  field: "planningStart" | "planningEnd",
  value: string
): PlannerStoreState {
  return updatePlannerDraft(state, context, (draft) => ({
    ...draft,
    [field]: value,
  }), {
    preserveParsedResponse: true,
  });
}

export function setBreakMode(
  state: PlannerStoreState,
  context: IntakeFlowContext,
  breakMode: BreakMode
): PlannerStoreState {
  return updatePlannerDraft(state, context, (draft) => ({
    ...draft,
    breakMode,
  }), {
    preserveParsedResponse: true,
    preserveStageWhenParsedResponse: true,
  });
}

export function setBreakCadence(
  state: PlannerStoreState,
  context: IntakeFlowContext,
  breakCadence: BreakCadence
): PlannerStoreState {
  return updatePlannerDraft(state, context, (draft) => ({
    ...draft,
    breakCadence,
  }), {
    preserveParsedResponse: true,
    preserveStageWhenParsedResponse: true,
  });
}

export function setPaceMode(
  state: PlannerStoreState,
  context: IntakeFlowContext,
  paceMode: PaceMode
): PlannerStoreState {
  return updatePlannerDraft(
    state,
    context,
    (draft) => ({
      ...draft,
      paceMode,
    }),
    {
      preserveParsedResponse: true,
      preserveStageWhenParsedResponse: true,
    }
  );
}

export function returnToDaySetup(state: PlannerStoreState): PlannerStoreState {
  return {
    ...state,
    stage: "day_setup",
  };
}

export function returnToInterpretation(
  state: PlannerStoreState
): PlannerStoreState {
  return {
    ...state,
    stage: "interpretation",
  };
}

export function addCarryForwardItemToIntake(
  state: PlannerStoreState,
  carryForwardItem: CarryForwardItem,
  carryForwardStatus: CarryForwardItem["carryForwardStatus"]
): PlannerStoreState {
  const nextCarryForwardItem = {
    ...carryForwardItem,
    carryForwardStatus,
  };
  const nextIntakeCarryForwardItems = [
    ...state.intakeCarryForwardItems.filter(
      (item) => item.id !== carryForwardItem.id
    ),
    nextCarryForwardItem,
  ];

  return {
    ...state,
    intakeCarryForwardItems: nextIntakeCarryForwardItems,
    parsedTaskResponse: state.parsedTaskResponse
      ? {
          ...state.parsedTaskResponse,
          tasks: mergeCarryForwardTasks(
            state.parsedTaskResponse.tasks,
            nextIntakeCarryForwardItems
          ),
        }
      : state.parsedTaskResponse,
  };
}

export function lockTaskToDetectedTime(
  state: PlannerStoreState,
  context: IntakeFlowContext,
  taskId: string
): PlannerStoreState {
  if (!state.parsedTaskResponse) {
    return state;
  }

  const targetTask = state.parsedTaskResponse.tasks.find((task) => task.id === taskId);

  if (
    !targetTask ||
    !targetTask.timingPreference ||
    targetTask.timingPreference.kind !== "time_anchored_unconfirmed"
  ) {
    return state;
  }

  const hardStartTime = targetTask.timingPreference.preferredStartTime;
  const hardEndTime = addMinutesWithOffset(
    hardStartTime,
    targetTask.estimatedMinutes,
    context.offset
  );
  const updatedTask: Task = {
    ...targetTask,
    hardStartTime,
    hardEndTime,
    timingPreference: undefined,
  };
  const nextTasks = state.parsedTaskResponse.tasks.map((task) =>
    task.id === taskId ? updatedTask : task
  );
  const constraintWarnings = validateFixedTimeTaskConstraint({
    task: updatedTask,
    tasks: nextTasks,
    hardEvents: state.parsedTaskResponse.hardEvents,
    planningWindow: buildPreviewPlanningWindow(state.intakeDraft, context),
  });

  if (constraintWarnings.length > 0) {
    return {
      ...state,
      plannerWarnings: [
        ...state.parsedTaskResponse.warnings,
        ...constraintWarnings,
      ],
    };
  }

  return {
    ...state,
    stage: "interpretation",
    parsedTaskResponse: {
      ...state.parsedTaskResponse,
      tasks: nextTasks,
    },
    draftScheduleResponse: null,
    plannerWarnings: state.parsedTaskResponse.warnings,
    routeHonestyWarnings: [],
    oracleAdvice: [],
  };
}

export function keepTaskFlexible(
  state: PlannerStoreState,
  taskId: string
): PlannerStoreState {
  if (!state.parsedTaskResponse) {
    return state;
  }

  const nextTasks = state.parsedTaskResponse.tasks.map((task) => {
    if (
      task.id !== taskId ||
      !task.timingPreference ||
      task.timingPreference.kind !== "time_anchored_unconfirmed"
    ) {
      return task;
    }

      return {
        ...task,
        timingPreference: {
          ...task.timingPreference,
          kind: "preferred_time" as const,
          decisionState: "kept_flexible" as const,
        },
      };
  });

  return {
    ...state,
    stage: "interpretation",
    parsedTaskResponse: {
      ...state.parsedTaskResponse,
      tasks: nextTasks,
    },
    draftScheduleResponse: null,
    plannerWarnings: state.parsedTaskResponse.warnings,
    routeHonestyWarnings: [],
    oracleAdvice: [],
  };
}

export function unlockTaskFromTime(
  state: PlannerStoreState,
  taskId: string
): PlannerStoreState {
  if (!state.parsedTaskResponse) {
    return state;
  }

  const nextTasks = state.parsedTaskResponse.tasks.map((task) =>
    task.id === taskId
      ? {
          ...task,
          hardStartTime: undefined,
          hardEndTime: undefined,
        }
      : task
  );

  return {
    ...state,
    stage: "interpretation",
    parsedTaskResponse: {
      ...state.parsedTaskResponse,
      tasks: nextTasks,
    },
    draftScheduleResponse: null,
    plannerWarnings: state.parsedTaskResponse.warnings,
    routeHonestyWarnings: [],
    oracleAdvice: [],
  };
}

export function setTaskEstimatedMinutes(
  state: PlannerStoreState,
  taskId: string,
  minutes: number
): PlannerStoreState {
  if (!state.parsedTaskResponse) {
    return state;
  }

  const normalizedMinutes = clampMinutes(minutes);
  const nextTasks = state.parsedTaskResponse.tasks.map((task) =>
    task.id === taskId
      ? {
          ...task,
          estimatedMinutes: normalizedMinutes,
        }
      : task
  );

  return {
    ...state,
    stage: "interpretation",
    parsedTaskResponse: {
      ...state.parsedTaskResponse,
      tasks: nextTasks,
    },
    draftScheduleResponse: null,
    plannerWarnings: state.parsedTaskResponse.warnings,
    routeHonestyWarnings: [],
    oracleAdvice: [],
  };
}

export function setTaskDueAt(
  state: PlannerStoreState,
  taskId: string,
  dueAtInput: string,
  offset: string
): PlannerStoreState {
  if (!state.parsedTaskResponse) {
    return state;
  }

  const dueAt = dueAtInput
    ? toIsoDateTimeFromLocalInput(dueAtInput, offset)
    : undefined;
  const nextTasks = state.parsedTaskResponse.tasks.map((task) =>
    task.id === taskId
      ? {
          ...task,
          dueAt,
          dueDatePreference: undefined,
        }
      : task
  );

  return {
    ...state,
    stage: "interpretation",
    parsedTaskResponse: {
      ...state.parsedTaskResponse,
      tasks: nextTasks,
    },
    draftScheduleResponse: null,
    plannerWarnings: state.parsedTaskResponse.warnings,
    routeHonestyWarnings: [],
    oracleAdvice: [],
  };
}

export function acceptDetectedTaskDueDate(
  state: PlannerStoreState,
  taskId: string
): PlannerStoreState {
  if (!state.parsedTaskResponse) {
    return state;
  }

  const nextTasks = state.parsedTaskResponse.tasks.map((task) =>
    task.id === taskId && task.dueDatePreference
      ? {
          ...task,
          dueAt: task.dueDatePreference.suggestedDueAt,
          dueDatePreference: undefined,
        }
      : task
  );

  return {
    ...state,
    stage: "interpretation",
    parsedTaskResponse: {
      ...state.parsedTaskResponse,
      tasks: nextTasks,
    },
    draftScheduleResponse: null,
    plannerWarnings: state.parsedTaskResponse.warnings,
    routeHonestyWarnings: [],
    oracleAdvice: [],
  };
}

export function dismissDetectedTaskDueDate(
  state: PlannerStoreState,
  taskId: string
): PlannerStoreState {
  if (!state.parsedTaskResponse) {
    return state;
  }

  const nextTasks = state.parsedTaskResponse.tasks.map((task) =>
    task.id === taskId
      ? {
          ...task,
          dueDatePreference: undefined,
        }
      : task
  );

  return {
    ...state,
    stage: "interpretation",
    parsedTaskResponse: {
      ...state.parsedTaskResponse,
      tasks: nextTasks,
    },
    draftScheduleResponse: null,
    plannerWarnings: state.parsedTaskResponse.warnings,
  };
}

export function resetTaskEstimatedMinutesToSuggested(
  state: PlannerStoreState,
  taskId: string
): PlannerStoreState {
  if (!state.parsedTaskResponse) {
    return state;
  }

  const targetTask = state.parsedTaskResponse.tasks.find((task) => task.id === taskId);
  const suggestedMinutes = targetTask?.timingPreference?.suggestedMinutes;

  if (!suggestedMinutes) {
    return state;
  }

  return setTaskEstimatedMinutes(state, taskId, suggestedMinutes);
}

export function interpretPlannerDraft(
  state: PlannerStoreState,
  context: IntakeFlowContext
): PlannerStoreState {
  const validation = validateDaySetupDraft(state.intakeDraft, context);

  if (hasBlockingErrors(validation.errors)) {
    return {
      ...state,
      errors: validation.errors,
      warnings: validation.warnings,
    };
  }

  const parsedTaskResponse = interpretDaySetup({
    draft: state.intakeDraft,
    context,
  });

  return applyParsedTaskResponse(state, parsedTaskResponse, {
    errors: validation.errors,
    warnings: validation.warnings,
  });
}

export function applyParsedTaskResponse(
  state: PlannerStoreState,
  parsedTaskResponse: ParsedTaskResponse,
  options?: {
    errors?: DaySetupErrors;
    warnings?: DaySetupWarnings;
  }
): PlannerStoreState {
  const mergedParsedTaskResponse = {
    ...parsedTaskResponse,
    tasks: mergeCarryForwardTasks(
      mergeReviewedTaskEdits(
        parsedTaskResponse.tasks,
        state.parsedTaskResponse?.tasks ?? []
      ),
      state.intakeCarryForwardItems
    ),
    followUpQuestions: parsedTaskResponse.followUpQuestions ?? [],
  };

  return {
    ...state,
    stage: "interpretation" as const,
    errors: options?.errors ?? state.errors,
    warnings: options?.warnings ?? state.warnings,
    parsedTaskResponse: mergedParsedTaskResponse,
    draftScheduleResponse: null,
    plannerWarnings: mergedParsedTaskResponse.warnings,
    routeHonestyWarnings: [],
    oracleAdvice: [],
  };
}

export function applyPlannerCsvImport(
  state: PlannerStoreState,
  context: IntakeFlowContext,
  importResult: PlannerCsvImportResult
): PlannerStoreState {
  const nextDraft: DaySetupDraft = {
    ...state.intakeDraft,
    csvText: importResult.csvText,
    fixedEvents: [],
    inputMode: "csv",
    rawText: "",
  };
  const validation = validateDaySetupDraft(nextDraft, context);

  return applyParsedTaskResponse(
    {
      ...state,
      stage: "day_setup",
      intakeDraft: nextDraft,
      intakeCarryForwardItems: [],
      errors: validation.errors,
      warnings: validation.warnings,
      parsedTaskResponse: null,
      draftScheduleResponse: null,
      plannerWarnings: [],
      routeHonestyWarnings: [],
      oracleAdvice: [],
    },
    importResult.parsedTaskResponse,
    {
      errors: validation.errors,
      warnings: validation.warnings,
    }
  );
}

export function buildDraftRoute(
  state: PlannerStoreState,
  planner: MockPlannerState,
  context: IntakeFlowContext
): PlannerStoreState {
  const validation = validateDaySetupDraft(state.intakeDraft, context);

  if (hasBlockingErrors(validation.errors)) {
    return {
      ...state,
      errors: validation.errors,
      warnings: validation.warnings,
    };
  }

  const parsedTaskResponse =
    state.parsedTaskResponse ??
    interpretDaySetup({
      draft: state.intakeDraft,
      context,
    });
  const mergedParsedTaskResponse = {
    ...parsedTaskResponse,
    tasks: mergeCarryForwardTasks(
      parsedTaskResponse.tasks,
      state.intakeCarryForwardItems
    ),
  };
  const completedTaskIds =
    state.stage === "draft_route" && state.draftScheduleResponse
      ? state.draftScheduleResponse.dayPlan.completedTaskIds ??
        planner.dayPlan.completedTaskIds ??
        []
      : planner.dayPlan.completedTaskIds ?? [];
  const plannerForDraftRoute: MockPlannerState = {
    ...planner,
    dayPlan: {
      ...planner.dayPlan,
      completedTaskIds,
    },
  };
  const planningWindow = buildPreviewPlanningWindow(state.intakeDraft, context);
  const draftScheduleResponse = generateDraftSchedule({
    breakMode: state.intakeDraft.breakMode,
    breakCadence: state.intakeDraft.breakCadence ?? DEFAULT_BREAK_CADENCE,
    paceMode: state.intakeDraft.paceMode ?? DEFAULT_PACE_MODE,
    currentTime: planner.currentTime,
    hardEvents: mergedParsedTaskResponse.hardEvents,
    planner: plannerForDraftRoute,
    planningWindow,
    rawText: getActivePlannerInputText(state.intakeDraft),
    tasks: mergedParsedTaskResponse.tasks,
  });
  return applyDraftScheduleResult({
    state,
    planner,
    draftScheduleResponse,
    parsedTaskResponse: mergedParsedTaskResponse,
    errors: validation.errors,
    warnings: validation.warnings,
  });
}

export function applyDraftScheduleResult({
  state,
  planner,
  draftScheduleResponse,
  parsedTaskResponse,
  errors,
  warnings,
}: {
  state: PlannerStoreState;
  planner: MockPlannerState;
  draftScheduleResponse: DraftScheduleResponse;
  parsedTaskResponse: ParsedTaskResponse;
  errors?: DaySetupErrors;
  warnings?: DaySetupWarnings;
}): PlannerStoreState {
  const dayPlan =
    state.stage === "draft_route" && state.draftScheduleResponse
      ? preserveExecutionHistoryOnRebuild(
          draftScheduleResponse.dayPlan,
          state.draftScheduleResponse.dayPlan,
          planner.currentTime
        )
      : draftScheduleResponse.dayPlan;
  const normalizedDraftScheduleResponse = normalizeDraftScheduleResponse(
    {
      ...draftScheduleResponse,
      dayPlan,
    },
    planner.currentTime
  );
  const scheduleValidation = validateGeneratedDayPlan(
    normalizedDraftScheduleResponse.dayPlan,
    {
      currentTime: planner.currentTime,
      allowProductiveBreaks:
        normalizedDraftScheduleResponse.dayPlan.breakMode === "productive",
      carryForwardItems: normalizedDraftScheduleResponse.carryForwardItems,
      dueWarnings: normalizedDraftScheduleResponse.dueWarnings,
      unplacedTasks: normalizedDraftScheduleResponse.unplacedTasks,
    }
  );
  const plannerWarnings = mergePlannerWarnings(
    mergePlannerWarnings(
      parsedTaskResponse.warnings,
      normalizedDraftScheduleResponse.warnings
    ),
    scheduleValidation.warnings
  );
  const routeMessaging = deriveRouteMessaging({
    currentTime: planner.currentTime,
    draftScheduleResponse: normalizedDraftScheduleResponse,
    validationWarnings: scheduleValidation.warnings,
  });

  if (!scheduleValidation.isValid) {
    return {
      ...state,
      stage: state.stage === "draft_route" ? "draft_route" : "interpretation",
      errors: errors ?? state.errors,
      warnings: warnings ?? state.warnings,
      parsedTaskResponse,
      draftScheduleResponse:
        state.stage === "draft_route" ? state.draftScheduleResponse : null,
      plannerWarnings,
      routeHonestyWarnings:
        state.stage === "draft_route" ? state.routeHonestyWarnings : [],
      oracleAdvice: state.stage === "draft_route" ? state.oracleAdvice : [],
    };
  }

  return {
    ...state,
    stage: "draft_route" as const,
    errors: errors ?? state.errors,
    warnings: warnings ?? state.warnings,
    parsedTaskResponse: {
      ...parsedTaskResponse,
      tasks: normalizedDraftScheduleResponse.dayPlan.tasks,
      hardEvents: normalizedDraftScheduleResponse.dayPlan.hardEvents,
      warnings: mergePlannerWarnings(
        parsedTaskResponse.warnings,
        normalizedDraftScheduleResponse.warnings
      ),
    },
    draftScheduleResponse: {
      ...normalizedDraftScheduleResponse,
    },
    plannerWarnings,
    routeHonestyWarnings: routeMessaging.routeHonestyWarnings,
    oracleAdvice: routeMessaging.oracleAdvice,
  };
}

export function markBlockComplete(
  state: PlannerStoreState,
  currentTime: string,
  blockId: string
): PlannerStoreState {
  return updateDraftRouteDayPlan(state, (dayPlan) =>
    markDayPlanBlockComplete(dayPlan, currentTime, blockId)
  );
}

export function skipBlock(
  state: PlannerStoreState,
  currentTime: string,
  blockId: string
): PlannerStoreState {
  return updateDraftRouteDayPlan(state, (dayPlan) =>
    skipDayPlanBlock(dayPlan, currentTime, blockId)
  );
}

export function togglePastBlockComplete(
  state: PlannerStoreState,
  currentTime: string,
  blockId: string
): PlannerStoreState {
  return updateDraftRouteDayPlan(state, (dayPlan) =>
    togglePastDayPlanBlockComplete(dayPlan, currentTime, blockId)
  );
}

export function delayBlock(
  state: PlannerStoreState,
  currentTime: string,
  blockId: string,
  delayMinutes: number
): PlannerStoreState {
  return updateDraftRouteDayPlan(state, (dayPlan) =>
    delayDayPlanBlock(dayPlan, currentTime, blockId, delayMinutes)
  );
}

export function buildPlannerView(
  planner: MockPlannerState,
  state: PlannerStoreState,
  context: IntakeFlowContext
): MockPlannerState {
  if (state.draftScheduleResponse && state.stage === "draft_route") {
    return {
      currentTime: planner.currentTime,
      dayPlan: synchronizeDayPlanToCurrentTime(
        state.draftScheduleResponse.dayPlan,
        planner.currentTime
      ),
    };
  }

  const planningWindow = buildPreviewPlanningWindow(state.intakeDraft, context);
  const previewHardEvents = buildPreviewHardEvents(state.intakeDraft, context);
  const previewHardEventIds = new Set(previewHardEvents.map((event) => event.id));
  const inferredHardEvents =
    state.parsedTaskResponse?.hardEvents.filter(
      (event) => !previewHardEventIds.has(event.id)
    ) ?? [];
  const hardEvents = mergePreviewHardEventsWithLockedTasks(
    [...previewHardEvents, ...inferredHardEvents].sort(
      (left, right) =>
        new Date(left.startTime).getTime() - new Date(right.startTime).getTime()
    ),
    state.parsedTaskResponse?.tasks ?? []
  );

  return {
    currentTime: planner.currentTime,
    dayPlan: {
      ...planner.dayPlan,
      planningWindow,
      rawInput: {
        ...planner.dayPlan.rawInput,
        rawText: getActivePlannerInputText(state.intakeDraft),
      },
      tasks: state.parsedTaskResponse?.tasks ?? [],
      hardEvents,
      blocks: [],
      breakMode: state.intakeDraft.breakMode,
      breakCadence: state.intakeDraft.breakCadence ?? DEFAULT_BREAK_CADENCE,
      paceMode: state.intakeDraft.paceMode ?? DEFAULT_PACE_MODE,
      completedTaskIds: planner.dayPlan.completedTaskIds ?? [],
      activeBlockId: undefined,
      updatedAt: planner.currentTime,
    },
  };
}

function mergePreviewHardEventsWithLockedTasks(
  hardEvents: HardEvent[],
  tasks: Task[]
) {
  const lockedTaskAnchors = tasks
    .filter((task) => Boolean(task.hardStartTime && task.hardEndTime))
    .map((task) => ({
      id: `locked-task-${task.id}`,
      title: task.title,
      startTime: task.hardStartTime!,
      endTime: task.hardEndTime!,
      locked: true as const,
      source: task.source,
      notes: "Locked task.",
    }));

  return [...hardEvents, ...lockedTaskAnchors].sort(
    (left, right) =>
      new Date(left.startTime).getTime() - new Date(right.startTime).getTime()
  );
}

export function getPlannerStoreContext(planner: MockPlannerState) {
  return getIntakeFlowContext(planner);
}

function isPersistedPlannerState(
  value: Partial<PersistedPlannerState>
): value is PersistedPlannerState {
  return Boolean(
    value &&
      typeof value.stage === "string" &&
      value.intakeDraft &&
      typeof value.intakeDraft.rawText === "string" &&
      Array.isArray(value.intakeDraft.fixedEvents) &&
      value.warnings &&
      Array.isArray(value.warnings.global) &&
      Array.isArray(value.plannerWarnings)
  );
}

function isPersistedPlannerSessionRecord(
  value: Partial<PersistedPlannerSessionRecord>
): value is PersistedPlannerSessionRecord {
  return Boolean(value && value.plannerState && isPersistedPlannerState(value.plannerState));
}

function isPersistedPlannerDraftRecord(
  value: Partial<PersistedPlannerDraftRecord>
): value is PersistedPlannerDraftRecord {
  return Boolean(
    value &&
      typeof value.id === "string" &&
      typeof value.createdAt === "string" &&
      typeof value.updatedAt === "string" &&
      typeof value.title === "string" &&
      typeof value.subtitle === "string" &&
      value.session &&
      isPersistedPlannerSessionRecord(value.session ?? {})
  );
}

function isDaySetupInputMode(value: unknown): value is DaySetupInputMode {
  return value === "brain_dump" || value === "csv";
}

function isReplanMode(value: unknown): value is ReplanMode {
  return (
    value === "replan_from_now" ||
    value === "keep_essentials_only" ||
    value === "gentler_remainder" ||
    value === "use_productive_breaks" ||
    value === "preserve_focus_first"
  );
}

function isPlannerTimeMode(value: unknown): value is PlannerTimeMode {
  return value === "live" || value === "manual";
}

function clampMinutes(minutes: number) {
  if (!Number.isFinite(minutes)) {
    return 5;
  }

  return Math.max(5, Math.min(240, Math.round(minutes)));
}

function normalizeDraftScheduleResponse(
  draftScheduleResponse: DraftScheduleResponse,
  currentTime: string
): DraftScheduleResponse {
  const dayPlan = synchronizeDayPlanToCurrentTime(
    {
      ...draftScheduleResponse.dayPlan,
      breakCadence:
        normalizeBreakCadence(
          draftScheduleResponse.dayPlan.breakCadence as
            | BreakCadence
            | "focus_60"
            | undefined
        ),
      paceMode: normalizePaceMode(draftScheduleResponse.dayPlan.paceMode),
    },
    currentTime
  );
  const carryForwardItems = normalizeCarryForwardItemsForDayPlan(
    dayPlan,
    draftScheduleResponse.carryForwardItems ?? []
  );
  const dueWarnings = [
    ...deriveScheduledDueWarnings(dayPlan),
    ...deriveCarryForwardLateWarnings(
      carryForwardItems,
      dayPlan.planningWindow.endTime
    ),
  ];

  return {
    ...draftScheduleResponse,
    dayPlan,
    carryForwardItems,
    carryForwardTaskIds:
      draftScheduleResponse.carryForwardTaskIds ??
      draftScheduleResponse.carryForwardItems?.map(
        (carryForwardItem) => carryForwardItem.taskId
      ) ??
      [],
    dueWarnings,
    unplacedTasks: normalizeUnplacedTasksForDayPlan(
      dayPlan,
      draftScheduleResponse.unplacedTasks ?? [],
      carryForwardItems
    ),
    oracleAdvice: normalizeOracleAdvice({
      currentTime,
      draftScheduleResponse: {
        ...draftScheduleResponse,
        dayPlan,
        carryForwardItems,
        dueWarnings,
        unplacedTasks: normalizeUnplacedTasksForDayPlan(
          dayPlan,
          draftScheduleResponse.unplacedTasks ?? [],
          carryForwardItems
        ),
      },
    }),
  };
}

function deriveRouteMessaging({
  currentTime,
  draftScheduleResponse,
  validationWarnings,
}: {
  currentTime: string;
  draftScheduleResponse: DraftScheduleResponse;
  validationWarnings: string[];
}) {
  return {
    routeHonestyWarnings: mergePlannerWarnings(
      [
        ...(draftScheduleResponse.carryForwardItems.length > 0
          ? [
              "Not everything fit inside this planning window, so overflow was carried forward explicitly.",
            ]
          : []),
        ...draftScheduleResponse.dueWarnings.map((warning) => warning.message),
      ],
      validationWarnings
    ),
    oracleAdvice: normalizeOracleAdvice({
      currentTime,
      draftScheduleResponse,
    }),
  };
}

function normalizeOracleAdvice({
  currentTime,
  draftScheduleResponse,
}: {
  currentTime: string;
  draftScheduleResponse: DraftScheduleResponse;
}) {
  const filteredAdvice = dedupeStrings(
    (draftScheduleResponse.oracleAdvice ?? []).map((item) =>
      normalizeOracleAdviceItem(item)
    )
  );

  if (filteredAdvice.length > 0) {
    return filteredAdvice;
  }

  const fallbackAdvice = buildFallbackOracleAdvice({
    currentTime,
    dayPlan: draftScheduleResponse.dayPlan,
    carryForwardItems: draftScheduleResponse.carryForwardItems,
    unplacedTasks: draftScheduleResponse.unplacedTasks,
  });

  return dedupeStrings(fallbackAdvice.map((item) => normalizeOracleAdviceItem(item)));
}

function normalizeOracleAdviceItem(advice: string) {
  const trimmedAdvice = advice.trim();

  if (!trimmedAdvice) {
    return "";
  }

  if (
    /\bif\b.+\bruns over\b/i.test(trimmedAdvice) ||
    /may shift slightly/i.test(trimmedAdvice) ||
    /breaks are modeled/i.test(trimmedAdvice) ||
    /adjust lengths if you prefer/i.test(trimmedAdvice) ||
    /runs longer than the current focus cadence/i.test(trimmedAdvice) ||
    /not splittable/i.test(trimmedAdvice) ||
    /^plan (starts now|from )/i.test(trimmedAdvice)
  ) {
    return "";
  }

  const withoutCoaching = trimmedAdvice
    .replace(/\s*Consider a mid-task pause[^.]*\.?/i, "")
    .replace(/\s*Only pause mid-task[^.]*\.?/i, "")
    .trim();
  const normalizedCadence = withoutCoaching.replace(
    /\bit exceeds the [^ .]+ cadence\b/i,
    "it stays intact even though it runs longer than the current focus cadence"
  );

  return normalizedCadence;
}

function buildFallbackOracleAdvice({
  currentTime,
  dayPlan,
  carryForwardItems,
  unplacedTasks,
}: {
  currentTime: string;
  dayPlan: DayPlan;
  carryForwardItems: CarryForwardItem[];
  unplacedTasks: DraftScheduleResponse["unplacedTasks"];
}) {
  const currentMs = new Date(currentTime).getTime();
  const stalePastBlocks = dayPlan.blocks.filter(
    (block) =>
      !block.locked &&
      Boolean(block.taskId) &&
      new Date(block.endTime).getTime() < currentMs &&
      block.status !== "done" &&
      block.status !== "skipped"
  );

  if (stalePastBlocks.length >= 2) {
    return [
      `${stalePastBlocks.length} earlier blocks are still unmarked. If the route no longer matches reality, use Replan from now before reorganizing the remainder by hand.`,
    ];
  }

  if (carryForwardItems.length > 0 || unplacedTasks.length > 0) {
    return [
      "Overflow is already explicit. Protect the placed route first and let carried work wait unless today's priorities change.",
    ];
  }

  const routeFlowAnalysis = analyzeRouteFlowSequence(dayPlan.blocks, dayPlan.tasks);

  if (routeFlowAnalysis.hasForcedAwkwardInterleaving) {
    if (
      routeFlowAnalysis.knownLocationContexts.includes("out_of_home") &&
      routeFlowAnalysis.knownLocationContexts.includes("desk")
    ) {
      return [
        "Some out-of-home and desk work stay split because fixed anchors break up the cleaner grouping today.",
      ];
    }

    if (
      routeFlowAnalysis.knownLocationContexts.includes("out_of_home") &&
      routeFlowAnalysis.knownLocationContexts.includes("home")
    ) {
      return [
        "Some out-of-home and home tasks stay split because fixed anchors break up the cleaner grouping today.",
      ];
    }

    return [
      "Some context switching remains because fixed anchors break up the cleaner grouping today.",
    ];
  }

  return [
    "Route is holding as written. Replan from now only if the actual order has drifted from the timeline.",
  ];
}

function updateDraftRouteDayPlan(
  state: PlannerStoreState,
  updater: (dayPlan: DayPlan) => {
    changed: boolean;
    dayPlan: DayPlan;
    warning?: string;
  }
): PlannerStoreState {
  if (state.stage !== "draft_route" || !state.draftScheduleResponse) {
    return state;
  }

  const result = updater(state.draftScheduleResponse.dayPlan);
  const baseWarnings = getBasePlannerWarnings(state);

  if (!result.changed) {
    return result.warning
      ? {
          ...state,
          plannerWarnings: mergePlannerWarnings(baseWarnings, [result.warning]),
        }
      : state;
  }

  const currentTime = result.dayPlan.updatedAt;
  const draftScheduleResponse = normalizeDraftScheduleResponse(
    {
      ...state.draftScheduleResponse,
      dayPlan: result.dayPlan,
    },
    currentTime
  );
  const scheduleValidation = validateGeneratedDayPlan(
    draftScheduleResponse.dayPlan,
    {
      currentTime,
      allowProductiveBreaks:
        draftScheduleResponse.dayPlan.breakMode === "productive",
      carryForwardItems: draftScheduleResponse.carryForwardItems,
      dueWarnings: draftScheduleResponse.dueWarnings,
      unplacedTasks: draftScheduleResponse.unplacedTasks,
    }
  );

  if (!scheduleValidation.isValid) {
    return {
      ...state,
      plannerWarnings: mergePlannerWarnings(
        baseWarnings,
        scheduleValidation.warnings
      ),
    };
  }

  const routeMessaging = deriveRouteMessaging({
    currentTime,
    draftScheduleResponse,
    validationWarnings: [],
  });

  return {
    ...state,
    draftScheduleResponse,
    plannerWarnings: mergePlannerWarnings(baseWarnings, result.warning ? [result.warning] : []),
    routeHonestyWarnings: routeMessaging.routeHonestyWarnings,
    oracleAdvice: routeMessaging.oracleAdvice,
  };
}

function getBasePlannerWarnings(state: PlannerStoreState) {
  return mergePlannerWarnings(state.parsedTaskResponse?.warnings ?? [], [
    ...(state.draftScheduleResponse?.warnings ?? []),
  ]);
}

function mergePlannerWarnings(existing: string[], incoming: string[]) {
  return Array.from(new Set([...existing, ...incoming].filter(Boolean)));
}

function dedupeStrings(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter(Boolean))) as string[];
}

function mergeCarryForwardTasks(
  tasks: Task[],
  intakeCarryForwardItems: CarryForwardItem[]
) {
  return [
    ...tasks,
    ...intakeCarryForwardItems
      .filter(
        (carryForwardItem) =>
          !tasks.some((task) => task.id === `${carryForwardItem.id}-intake`)
      )
      .map((carryForwardItem) =>
        createTaskFromCarryForwardItem(carryForwardItem)
      ),
  ];
}

function mergeReviewedTaskEdits(tasks: Task[], existingTasks: Task[]) {
  const existingTaskById = new Map(
    existingTasks.map((task) => [task.id, task] as const)
  );

  return tasks.map((task) => {
    const existingTask = existingTaskById.get(task.id);

    if (!existingTask) {
      return task;
    }

    return {
      ...task,
      estimatedMinutes: existingTask.estimatedMinutes,
      dueAt: existingTask.dueAt,
      dueDatePreference: existingTask.dueDatePreference,
      hardStartTime: existingTask.hardStartTime,
      hardEndTime: existingTask.hardEndTime,
      timingPreference: existingTask.timingPreference,
    };
  });
}
