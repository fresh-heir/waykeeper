# 04 · Data Schema — v2

This schema is intentionally opinionated. It is designed for a one-day AI-assisted planner whose source of truth lives in app state, not in model prose.

Use TypeScript interfaces and/or Zod runtime validation.

---

## 1. Core enums

```ts
type TaskType =
  | "deep_work"
  | "admin"
  | "chore"
  | "self_care"
  | "errand"
  | "appointment"
  | "break_candidate"
  | "other";

type BreakMode = "restful" | "productive";

type Priority = "critical" | "high" | "medium" | "low";

type EnergyLevel = "low" | "medium" | "high";

type ScheduleBlockType =
  | "focus"
  | "break"
  | "appointment"
  | "admin"
  | "chore"
  | "self_care"
  | "buffer"
  | "transition"
  | "other";

type ScheduleBlockStatus =
  | "upcoming"
  | "active"
  | "done"
  | "skipped"
  | "deferred"
  | "expired";

type ReplanMode =
  | "replan_from_now"
  | "keep_essentials_only"
  | "gentler_remainder"
  | "use_productive_breaks"
  | "preserve_focus_first";

type SourceTag = "user" | "ai" | "mixed" | "system";
```

---

## 2. Raw intake model

```ts
interface RawTaskInput {
  rawText: string;
  createdAt: string; // ISO timestamp
}
```

This is preserved for auditing and later re-interpretation.

---

## 3. Planning window

```ts
interface PlanningWindow {
  startTime: string; // ISO datetime in local zone
  endTime: string;   // ISO datetime in local zone
}
```

---

## 4. Task model

```ts
interface Task {
  id: string;
  title: string;
  rawText?: string;
  type: TaskType;
  estimatedMinutes: number;
  priority: Priority;
  mustDoToday: boolean;
  breakEligible: boolean;
  splittable: boolean;
  deferrable: boolean;
  deferCount?: number;
  delayedCount?: number;
  energyLevel: EnergyLevel;
  dueAt?: string; // ISO datetime, future-facing
  hardStartTime?: string; // HH:MM local if task itself must begin at a fixed time
  hardEndTime?: string;   // HH:MM local
  carryForward?: boolean;
  carriedFromDate?: string; // YYYY-MM-DD local
  carryForwardReason?: "overflow" | "manual" | "unplaced" | "replan_overflow";
  carryForwardStatus?: "pending" | "accepted" | "review" | "ignored" | "consumed";
  notes?: string;
  source: SourceTag;
}
```

### Notes
- `breakEligible` means the task can be considered for productive-break placement.
- `splittable` means the task may be broken into multiple schedule blocks.
- `deferrable` means it may be dropped or pushed out of the day if the schedule cannot hold it.
- `deferCount` / `delayedCount` are future-facing signals for protecting repeatedly deferred work.
- `dueAt` is not required for v1, but later carry-forward logic should treat it as a warning threshold.

---

## 5. Fixed event model

```ts
interface HardEvent {
  id: string;
  title: string;
  startTime: string; // ISO datetime
  endTime: string;   // ISO datetime
  notes?: string;
  locked: true;
  source: SourceTag;
}
```

Hard events are timeline anchors. They cannot be moved by AI replanning.

---

## 6. Schedule block model

```ts
interface ScheduleBlock {
  id: string;
  taskId?: string;
  title: string;
  blockType: ScheduleBlockType;
  startTime: string; // ISO datetime
  endTime: string;   // ISO datetime
  status: ScheduleBlockStatus;
  locked: boolean;
  source: SourceTag;
  isBreakEligibleTaskPlacement?: boolean;
  notes?: string;
}
```

### Notes
- `taskId` is omitted for pure breaks, buffers, or transitions without a backing task.
- `locked` should be true for hard events and any block the user explicitly locks later.
- `isBreakEligibleTaskPlacement` is helpful when a low-effort task is intentionally placed inside a productive break window.

---

## 7. Timeline state model

```ts
interface TimelineState {
  activeBlockId?: string;
  currentTime: string; // ISO datetime
  blocks: ScheduleBlock[];
}
```

This can be derived from the main day plan, but keeping it explicit can simplify rendering and execution state.

---

## 8. Day plan model

```ts
interface DayPlan {
  id: string;
  date: string; // YYYY-MM-DD local
  planningWindow: PlanningWindow;
  rawInput: RawTaskInput;
  tasks: Task[];
  hardEvents: HardEvent[];
  blocks: ScheduleBlock[];
  breakMode: BreakMode;
  activeBlockId?: string;
  createdAt: string;
  updatedAt: string;
}
```

This is the canonical saved planner object for the day.
A future same-day Route / List companion view should derive from this same `DayPlan` state rather than introducing a second planner model.

---

## 9. AI parsing response

```ts
interface ParsedTaskResponse {
  tasks: Task[];
  warnings?: string[];
  followUpQuestions?: string[];
}
```

### Rules
- follow-up questions should be minimal and targeted
- warnings should be human-readable and actionable

---

## 10. AI schedule draft response

```ts
interface DraftScheduleResponse {
  tasks: Task[];
  blocks: ScheduleBlock[];
  warnings?: string[];
  summary?: string;
}
```

### Rules
- tasks may be refined during schedule drafting if the AI needs to update estimates or break eligibility
- `blocks` must fit within the planning window and respect hard events
- `summary` is optional human-readable support text, not the source of truth

---

## 11. Replan request model

```ts
interface ReplanRequest {
  currentTime: string; // ISO datetime
  completedBlockIds: string[];
  currentBlocks: ScheduleBlock[];
  remainingTasks: Task[];
  hardEvents: HardEvent[];
  breakMode: BreakMode;
  replanMode: ReplanMode;
}
```

### Rules
- completed history is immutable in the replan request
- `currentBlocks` should include the full existing block history for context
- `remainingTasks` should reflect what still needs placement or revision

---

## 12. AI replan response

```ts
interface ReplanResponse {
  blocks: ScheduleBlock[];
  droppedTaskIds?: string[];
  carryForwardTaskIds?: string[];
  warnings?: string[];
  summary?: string;
}
```

### Rules
- response should only revise the remainder from `currentTime` onward
- completed blocks must not be rewritten
- fixed events must remain fixed
- if tasks are dropped or deferred, they must be surfaced via `droppedTaskIds` and/or warnings
- `carryForwardTaskIds` is future-facing support for explicit overflow handling and next-day intake

---

## 13. UI action payloads

These are useful app-side actions regardless of whether AI is involved.

```ts
interface MarkBlockCompletePayload {
  blockId: string;
  completedAt: string; // ISO datetime
}

interface DelayBlockPayload {
  blockId: string;
  delayMinutes: number;
}

interface ResizeBlockPayload {
  blockId: string;
  newEndTime: string; // ISO datetime
}

interface SkipBlockPayload {
  blockId: string;
}
```

These should modify app state directly. They do not require AI unless the user then chooses to replan.

---

## 14. Recommended Zod-style validation constraints

At minimum validate:
- `estimatedMinutes > 0`
- block `endTime > startTime`
- planning window `endTime > startTime`
- hard events fall within or are intentionally allowed outside the planning day
- schedule blocks do not overlap illegally
- AI outputs reference valid task IDs when `taskId` is present

---

## 15. Source-of-truth rule

The timeline UI must render from `DayPlan.blocks`.
The planner must never rely on freeform AI prose as the authoritative schedule.
A future List view should derive from the same `DayPlan`, `tasks`, `blocks`, and `hardEvents` state already used by the route.

AI may provide:
- interpretation
- estimates
- structured block proposals
- revised block proposals

But the app stores and renders the actual state.

### Future same-day List companion note
No major schema redesign is required for a future same-day Route / List toggle.
List sections such as:
- placed today
- not yet placed
- fixed anchors
- completed
- later, Carry Forward

should be treated as derived UI groupings over the existing day state, not as a board model, column system, or separate multi-day persistence structure.

### Future-ready date fields
For tasks and/or planned blocks, support optional future-oriented fields such as:
- `scheduledDate?: string`
- `targetDate?: string`
- `deferredToDate?: string`
- `originDate?: string`
- `carriedFromDate?: string`
- `dueAt?: string`

These are not required for v1 behavior, but they allow future carry-forward handling and next-day intake without replacing the existing day-first model.

### Future carry-forward support note
If Carry Forward is added later, the schema should support:
- explicit overflow state rather than silent dropping
- repeated deferral counts that influence future prioritization
- due dates and due times that trigger warnings before something is scheduled or deferred beyond its due point

### Future multi-day support note
v1 centers on a single `DayPlan`, but later versions may manage a date-keyed collection of day plans:
- `DayPlan[]`
- or `Record<date, DayPlan>`

This future support should stay minimal and should not complicate v1 logic or turn the core model into a full week planner.
