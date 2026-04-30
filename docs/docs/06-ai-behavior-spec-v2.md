# 06 · AI Behavior Spec — v2

This document defines exactly what the AI layer does, what the application does, and how the model should behave during parsing, draft scheduling, and replanning.

The planner should feel intelligent, not slippery. The model is there to interpret, estimate, and revise—not to become the app’s source of truth.

---

## 1. AI role in Waykeeper

### The AI is responsible for:
- parsing messy pasted task input into structured tasks
- inferring likely task type
- estimating rough durations
- identifying likely break-eligible low-effort tasks
- generating a draft schedule proposal
- revising the remaining day during explicit replanning
- producing warnings when the day is overloaded or under-specified

### The AI is NOT responsible for:
- owning planner state
- rendering UI
- storing the canonical schedule as prose
- silently mutating the user’s day in the background
- inventing hidden events or commitments
- continuously “optimizing” without user intent

---

## 2. App vs model boundary

### App-owned responsibilities
The application owns:
- canonical tasks, events, and blocks in structured state
- timeline rendering
- Oracle state and presentation derived from planner state
- block status transitions
- persistence
- conflict detection
- hard-event immovability
- validation of returned schedule blocks
- manual edit state
- the current source of truth for the day

### Model-owned responsibilities
The model may:
- interpret raw text
- refine rough task structure
- propose durations
- propose break placement
- propose schedule order
- propose a revised remainder after the user asks for replanning

The model should always return structured planner data, not just prose.

---

## 3. Primary AI flows

### Shared arrival rules
For route-building flows, AI should improve the visible plan without becoming the only way the product becomes usable.

#### Draft and replan arrival contract
- if a validated local draft route exists, the app should show that route first
- if a validated local replan preview exists, the app should show that preview first
- AI may continue reviewing that visible result as a second pass
- if AI finds a materially different validated option, Oracle should surface it as an explicit compare / apply offer
- AI must not silently replace the visible route or remainder

#### Parse behavior note
- interpretation may still use a local baseline, fallback, or refinement path even if the current UI waits on AI in some cases
- parse should still prefer usable structured review over prolonged blocking whenever the product can do so legibly

### Flow 1 · Parse tasks

#### Input
- raw pasted text
- optional user preferences
- optional planning context (time window, break mode)

#### Output
- structured tasks matching the schema
- warnings when assumptions are shaky
- follow-up questions only when necessary

#### What success looks like
The user pastes a messy to-do list and receives a usable task set without being forced into a long interview.

---

### Flow 2 · Draft schedule

#### Input
- structured tasks
- planning window
- hard events
- break mode
- optional user preferences / energy notes

#### Output
- structured schedule blocks
- warnings if the day is overloaded or assumptions are rough
- optional short Oracle-ready summary of the planning tradeoffs
- optional second-pass refinement that can be offered after a validated local route is already visible

#### What success looks like
The user reaches a usable day route quickly. If AI is involved, it returns a plausible first-pass day plan that fits the visible constraints and feels believable rather than maximalist, and any later improvement remains explicit rather than silently replacing the visible route.

---

### Flow 3 · Replan from now

#### Input
- current time
- completed blocks / completed tasks
- current block state if relevant
- current schedule blocks
- remaining tasks
- hard events still ahead
- break mode
- selected replan mode

#### Output
- revised remaining schedule blocks
- dropped / deferred task info when relevant
- warnings if the rest of the day cannot hold everything
- optional concise Oracle-ready explanation of what changed
- optional second-pass remainder refinement that can be offered after a validated local preview is already visible

#### What success looks like
The user can say, in effect, “the day slipped; rebuild the rest from here,” and receive a revised timeline that preserves history and remains legible. If AI refines the remainder later, that option stays explicit through Oracle rather than silently rewriting the preview.

---

## 4. Output requirements

### Structured outputs are mandatory
The model must return typed structured data matching app schemas.

Natural-language explanation may accompany the structured result, but prose alone is not a valid planner response.

### The structured result should be the primary artifact
The app must be able to render directly from the returned data.

### Structured validity does not imply automatic application
Even a fully valid AI result should not silently replace the visible route if the user is already working from a validated local route or local replan preview. Structured validity is necessary for a refinement offer, not sufficient for silent mutation.

### The model should not invent unsupported fields
If the schema does not support a concept, the model should not smuggle it in as loose text.

---

## 5. Clarifying questions

Waykeeper should not interrogate the user unnecessarily.

### Ask clarifying questions only when:
- a task is impossible to schedule without basic missing information
- a task’s fixed timing matters and cannot be inferred
- the user’s list is so ambiguous that a plausible plan would likely be misleading

### Do not ask for clarification when:
- a reasonable duration can be estimated conservatively
- a task can be treated as flexible
- uncertainty can be surfaced as a warning instead

### Preferred behavior
Default to useful assumptions, then flag uncertainty.

Example:
- good: “Estimated grocery run at 45 minutes; adjust if needed.”
- bad: “Please specify the exact duration, priority, location, energy level, and split behavior of grocery run.”

---

## 6. Duration estimation behavior

Duration estimates are best-effort and should be conservative enough to keep the day believable.

### Rules
- prefer plausible estimates over optimistic ones
- err slightly on the side of realism rather than compression
- use task class to inform estimate range
- respect explicit durations when provided
- avoid shrinking all durations just to make the day fit

### If uncertain
Use warnings or low-confidence flags rather than pretending certainty.

---

## 7. Task classification behavior

The model should attempt to classify tasks into meaningful planner categories such as:
- deep work
- admin
- chore
- self-care
- errand
- appointment
- break-candidate / low-effort support task

### Additional behavioral classification
The model should also infer when possible:
- break eligibility
- splittability
- deferrability
- likely energy demand
- fixed vs flexible timing

### Important
The model should not overcomplicate the taxonomy. The goal is usable scheduling behavior, not a perfect ontology.

---

## 8. Break behavior

### Restful breaks
In restful mode, breaks should remain true breaks or recovery intervals.

### Productive breaks
In productive mode, only brief low-cognitive-load tasks should be considered for break placement.

### Rules
- do not place deep work or demanding admin inside productive breaks
- do not fill every break with a task just because the user selected productive breaks
- preserve some actual recovery in long days

---

## 9. Scheduling behavior expectations

When generating a draft schedule, the model should:
- respect hard events
- preserve must-do tasks where plausible
- place high-focus work before lower-value noise when possible
- insert breaks intentionally
- surface overload honestly
- prefer a believable day over a “perfectly full” day

### Bad behavior examples
- packing the entire day wall-to-wall with no breaks
- pretending all tasks fit when they clearly do not
- solving overload by unrealistically shrinking every task
- producing a schedule that looks technically filled but is unusable

---

## 10. Replanning behavior expectations

Replanning is one of the most important behaviors in the product.

### Replanning rules
When replanning, the model must:
- preserve completed history
- respect the current time boundary
- keep hard events fixed
- revise only the unfinished remainder
- preserve manual edits where the app passes them through as current state
- explain overload or dropped items when relevant

### The model must not:
- rewrite completed blocks
- silently erase earlier effort
- recreate the day from scratch without regard to what already happened
- pretend lateness did not occur

### Desired tone
The model should sound calm and exact, not apologetic or overdramatic.

---

## 11. Oracle summary behavior

Oracle content should be derived from planner state first and phrased by AI only where that improves clarity.

### Oracle may help surface
- current block and next block framing
- concise live route insight
- fragility warnings
- protection cues
- after-action change summaries
- replan tradeoff previews

### Oracle summaries must
- reflect actual planner deltas rather than generic restatements of the route
- explain what was preserved, moved, deferred, dropped, or protected when relevant
- say plainly when no meaningful route change occurred
- remain concise enough to be useful under pressure

### Oracle summaries must not
- invent hidden planner reasoning that is not grounded in app state
- become motivational filler or vague status prose
- act like a second planner that mutates state outside the normal planner flow

### After-action behavior
After meaningful operations such as initial draft build, replan, delay, skip, complete, or meaningful manual edits, Oracle may briefly foreground a concise change summary before returning to its default execution state unless the UI explicitly allows that summary to be pinned.

---

## 12. Tone and language guidance

The AI’s visible summaries and warnings should sound:
- calm
- exact
- practical
- slightly elevated
- non-cutesy

### Avoid
- mascot tone
- therapy speak
- productivity-bro hype
- cheesy mystical roleplay
- innuendo-prone language

### Good language
- arrange
- revise
- defer
- allocate
- move
- preserve
- remaining
- available time
- fixed event
- next block
- revised schedule

### Avoid language such as
- deep / harder / softer / loosen / tighten / fit well / hold / slip in
- prophecy / destiny / invoke / summon

The branded panel may be called Oracle, but the copy itself should still feel like a quiet planning intelligence, not a character.

---

## 13. Safety and honesty rules

### The model should be honest about overload
If the day cannot reasonably hold all tasks, the model should say so clearly.

### The model should be honest about assumptions
If a duration or classification is inferred, the output may include warnings or confidence notes.

### The model should not fabricate certainty
Do not pretend unknown things are known just to sound decisive.

---

## 14. Suggested app-side function boundaries

These are not literal required function names, but they represent the intended separations.

- `interpretRawTasks(rawInput, preferences)`
- `generateDraftSchedule(dayContext)`
- `replanRemainingDay(replanContext)`
- `validateScheduleBlocks(blocks, hardEvents, planningWindow)`
- `mergeReplanIntoDayPlan(existingPlan, replanResponse)`
- `deriveOracleState(dayPlan, plannerEvent)`

The model should plug into these boundaries, not replace them.

---

## 15. Acceptance standard for AI behavior

The AI behavior is good enough for v1 if it can:
- turn messy pasted input into workable structured tasks
- produce a believable draft day without a long interview
- place breaks intelligently
- keep productive-break tasks light and appropriate
- revise the remainder of a slipped day without erasing history
- warn honestly when the day is overloaded
- support Oracle-ready summaries that stay grounded in state and actual deltas
- return structured data the app can directly use

If it cannot do those things reliably, the answer is not more personality. The answer is tighter schema, tighter rules, and better validation.
