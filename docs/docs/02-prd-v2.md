# 02 · Product Requirements Document (PRD) — v2

## Product name
Waykeeper

## Product summary
Waykeeper is a web-first, AI-assisted daily planner that converts a messy pasted task list into a realistic one-day timeline. It helps the user allocate work, place breaks intelligently, adapt when the day slips, and stay oriented around the question: **what am I doing now, and what happens next?**

Waykeeper is not a general productivity suite. It is a one-day planning and execution tool.

---

## 1. Problem statement
Most planning tools assume the user can already:
- estimate task duration accurately
- decide task order confidently
- fit tasks into a real day without overloading it
- recover from slippage without rebuilding everything manually

In practice, many users start with a chaotic list that mixes:
- focused work
- admin tasks
- chores
- errands
- self-care
- fixed appointments

The result is usually either no plan, or an unrealistic plan that collapses after the first delay.

Waykeeper solves this by turning raw task input into a structured, editable day route with explicit replanning.

---

## 2. Target user
Primary user:
- an individual planning one day at a time
- benefits from external structure when organizing messy input
- wants a linear, calendar-like view rather than a project dashboard
- needs help adapting when they inevitably get behind

This user may prefer:
- calm interfaces
- explicit timelines
- visible current/next actions
- realistic breaks
- lightweight planning rather than a large productivity system

---

## 3. Core product promise
Paste the day’s mess in. Get back a livable route through it.

The app should:
- reduce executive load
- make the day legible
- preserve user control
- treat replanning as a first-class action
- make schedule drift recoverable instead of catastrophic

---

## 4. Product principles

### P1. Timeline first
The day timeline is the primary surface of the app.
The product should always orient around time blocks, not abstract task lists.

### P2. AI proposes, app owns state
AI may parse, estimate, classify, draft, and revise.
The app owns the source of truth for tasks, blocks, edits, and saved plan state.

### P3. Replanning is explicit
The app must not silently and continuously rewrite the day.
Replanning happens when the user asks for it or chooses a guided action that implies it.

### P4. One day only in v1
This is a one-day planner. Multi-day planning, projects, recurrence, and long-range organization are out of scope.

### P5. Finite over exhaustive
The app should prefer a realistic day plan over maximizing task count.
If the day cannot hold everything, the system should expose that cleanly.

---

## 5. MVP goals
The MVP is successful if a user can:
1. paste a messy list of tasks and obligations
2. define available time for the day
3. add fixed commitments
4. receive a realistic draft schedule
5. view that schedule in a linear timeline
6. edit the plan manually
7. replan the remaining day after delays
8. always tell what they should be doing now

---

## 6. Scope

### In scope for v1
- paste-in raw task intake
- planning window (start/end time)
- fixed event entry
- AI task parsing into structured task objects
- AI draft schedule generation
- restful vs productive break preference
- vertical timeline view
- block detail/edit interaction
- explicit replan from now flow
- active block / execution state
- current-day persistence
- optional timer linked to current block

### Out of scope for v1
- multi-day planning
- projects / folders / tags
- recurring tasks
- shared calendars
- collaboration
- project notes
- native iOS app
- cross-device sync if it slows delivery
- background auto-replanning without user trigger

---

## 7. Primary user flows

### Flow A — Build today’s plan
1. User opens Waykeeper
2. User starts a new day plan or resumes an existing one
3. User pastes a messy to-do list
4. User sets available time window
5. User adds fixed events
6. User chooses break style
7. AI parses tasks into structured objects
8. User reviews / edits parsed tasks
9. User generates draft day plan
10. App renders timeline

### Flow B — Execute current block
1. User views timeline
2. User identifies current block
3. User starts the block timer or marks it in progress
4. User completes the block, delays it, or ends it early
5. Timeline state updates

### Flow C — Recover when behind
1. User realizes schedule drift occurred
2. User opens replan flow
3. App summarizes what is complete and what remains
4. User selects replan mode
5. AI + scheduling logic produce revised remainder
6. User confirms revised plan
7. Timeline updates from the current moment forward

---

## 8. Functional requirements

### FR-1 Raw intake
The user can paste a multiline plain-text list containing mixed task types.

### FR-2 Planning window
The user can define a local start time and end time for the planning day.

### FR-3 Fixed commitments
The user can add one or more fixed events with locked times.

### FR-4 AI interpretation
The system can convert raw text into structured tasks with at least:
- title
- type
- estimated duration
- priority
- break eligibility
- splittable or not
- deferrable or not

### FR-5 Task review
The user can review and edit interpreted tasks before schedule generation.

### FR-6 Draft schedule generation
The system can generate an initial day schedule using:
- structured tasks
- planning window
- fixed events
- break preference

### FR-7 Break mode
The user can choose between restful breaks and productive breaks.

### FR-8 Productive break placement
When productive breaks are selected, only low-cognitive-load break-eligible tasks may be placed inside them.

### FR-9 Timeline rendering
The main screen renders the day as a vertical time-based schedule with:
- current time marker
- visible block states
- clear distinction between block types

### FR-10 Manual schedule editing
The user can edit schedule blocks without immediately forcing AI replanning.

### FR-11 Active block state
The system can show the current block, remaining time, and next block.

### FR-12 Replanning
The user can request a revised remainder of the day from a specified current time.
Completed history and fixed events must be preserved.

### FR-13 Day persistence
The current day plan persists across refresh and reopen.

---

## 9. Non-functional requirements

### NFR-1 Legibility
The app should always answer “what am I doing now?” and “what happens next?” without hunting.

### NFR-2 Calmness
Visual design and motion must support planning and execution, not stimulation.

### NFR-3 Structured outputs
AI outputs must be structured and typed. Freeform prose must not be the only output format.

### NFR-4 Explainable revisions
When the day is replanned, the user should be able to understand what changed.

### NFR-5 Low-friction editing
Editing a task or block should feel lighter than rebuilding the day manually.

---

## 10. AI role boundaries

### AI should do
- parse raw task input
- estimate durations
- classify task types
- identify break-eligible tasks
- draft a day schedule
- replan remaining blocks

### AI should not do
- silently mutate the day in the background
- serve as the only source of truth
- return prose-only schedules
- invent hard events the user did not provide
- overwrite completed history

---

## 11. Scheduling assumptions for v1
- hard events are placed first
- must-do tasks outrank optional tasks
- deep work is protected when possible
- breaks are mandatory planning elements, not leftover scraps
- low-priority tasks may be deferred if the day cannot realistically hold everything
- replanning should preserve intent where possible rather than re-randomizing the whole day

---

## 12. Key risks

### Risk 1 — Overoptimistic schedule drafts
Mitigation: deterministic scheduling constraints, explicit break rules, realistic duration handling.

### Risk 2 — Planner bloat
Mitigation: stay one-day only; reject projects/recurrence/features outside the execution loop.

### Risk 3 — Slippery schedule behavior
Mitigation: make replanning explicit and confirmable.

### Risk 4 — Bad duration estimates
Mitigation: editable durations, visible task review step, later historical tuning.

---

## 13. Success criteria
The MVP should pass if:
- a user can go from raw pasted list to timeline in one sitting
- the generated plan respects fixed events
- the app inserts breaks according to preference and workload
- productive-break tasks are appropriate for breaks
- the app can revise the remainder of the day after a delay
- the user can always identify the current block and next block
- the app feels easier than manually rewriting the day

---

## 14. Future extensions (not for v1)
- iOS version
- historical duration learning
- optional calendar sync
- shared task source with Time Sanctuary
- reusable planning templates
- energy-aware planning preferences
