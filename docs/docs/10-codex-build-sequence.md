# 10 · Codex Build Sequence — v1

This document turns the Waykeeper handoff pack into an implementation sequence for Codex. The goal is to reduce drift and prevent the planner from being built as a vague “AI productivity app.”

## Build strategy
Do not ask Codex to build the entire product in one prompt.
Use milestone-sized implementation passes with explicit acceptance checks.

The recommended order is:
1. app shell and timeline scaffold
2. intake and task interpretation flow
3. planner state and schemas
4. deterministic schedule validation
5. draft schedule generation integration
6. timeline editing and execution state
7. replan-from-now flow
8. polish and design-system refinement

---

## Milestone 1 · App shell and timeline scaffold

### Goal
Create a web-first app shell with the main route, layout structure, and a timeline surface that can render mock blocks.

### Required outcome
- app boots successfully
- main layout exists
- timeline screen exists
- mock schedule blocks render on a vertical timeline
- current time indicator can render
- no AI integration yet

### Codex constraints
- keep this milestone presentational and state-light
- do not invent planner logic yet
- do not skip to fancy theming before the layout works

---

## Milestone 2 · Intake flow and day setup

### Goal
Build the first-use and intake screens.

### Required outcome
- raw paste input field
- planning window input
- fixed event input
- local form state
- validation for obvious bad input
- submit path into interpretation flow

### Codex constraints
- accept messy multiline input
- do not over-structure the input UI
- fixed events should remain lightweight to enter

---

## Milestone 3 · Structured planner state and schemas

### Goal
Implement canonical planner state using the defined schemas.

### Required outcome
- TypeScript types and/or Zod schemas for tasks, events, blocks, day plan, replan request/response
- local planner state store
- ability to persist and reload a day plan locally

### Codex constraints
- app state, not AI prose, is the source of truth
- reject invalid schedule blocks at the app boundary

---

## Milestone 4 · Interpretation review flow

### Goal
Turn pasted input into editable structured tasks before schedule generation.

### Required outcome
- task interpretation review screen
- editable task rows/cards
- duration, task type, must-do, break-eligible, splittable, deferrable fields
- local mock interpretation path first if AI is not wired yet

### Codex constraints
- keep editing lightweight
- do not turn this into a database management screen

---

## Milestone 5 · Deterministic schedule validation layer

### Goal
Implement app-owned schedule validation before or alongside AI scheduling.

### Required outcome
- hard-event overlap checks
- planning window checks
- productive-break eligibility checks
- block integrity validation
- basic overload detection helpers

### Codex constraints
- do not trust raw model outputs blindly
- this layer should exist before AI-generated schedules are treated as canonical

---

## Milestone 6 · Draft schedule generation integration

### Goal
Integrate AI-backed draft schedule generation.

### Required outcome
- planner context assembled from app state
- structured request to model
- structured response parsed into app state
- timeline populated with generated blocks
- warnings surfaced if the day is overloaded

### Codex constraints
- use structured outputs
- keep summaries secondary to structured planner data
- AI proposes, app validates and stores

---

## Milestone 7 · Timeline editing and execution state

### Goal
Make the generated timeline usable.

### Required outcome
- block detail/edit sheet
- mark complete
- skip block
- delay block
- change block duration
- active block state
- current block / next block summary

### Codex constraints
- manual edits must remain in app state
- do not auto-trigger full replans on every small edit

---

## Milestone 8 · Replan from now

### Goal
Implement explicit replanning from the current moment.

### Required outcome
- replan sheet/modal
- replan mode options
- current time boundary respected
- completed history preserved
- remaining schedule replaced with validated revised blocks
- dropped/deferred task feedback surfaced

### Codex constraints
- preserve history
- preserve hard events
- revise only remainder
- do not rebuild the day from scratch without regard to what already happened

---

## Milestone 9 · Design system and brand polish

### Goal
Apply the Waykeeper design language without losing planner clarity.

### Required outcome
- materials, type, spacing, iconography aligned to design system
- timeline remains legible
- fantasy motifs remain subtle
- no generic SaaS drift

### Codex constraints
- planner clarity first
- atmosphere second
- fantasy infusion must remain restrained

---

## Milestone 10 · QA pass

### Goal
Verify product behavior against the acceptance tests.

### Required outcome
- test main seed scenarios
- verify hard-event immovability
- verify productive-break rules
- verify overload honesty
- verify replan-from-now invariants
- verify timeline always answers “what now?”

### Codex constraints
- inspect rendered UI, not just types
- do not stop at “build passes” if behavior is still wrong

---

## Prompting guidance for Codex

For each milestone:
- point Codex at the relevant docs
- tell it which milestone it is implementing
- require it to explain its plan before coding
- require it to run / inspect the result after coding
- require it to compare against the relevant acceptance criteria

### Good pattern
- milestone goal
- files/docs to use
- constraints
- before-coding explanation
- implementation
- run/check
- refine if needed

### Bad pattern
“Build Waykeeper from these docs.”

That is too broad and invites invention.

---

## Minimum docs to cite per milestone

### Milestones 1–2
- 02 PRD
- 03 UX spec
- 07 design system

### Milestones 3–6
- 04 data schema
- 05 scheduling rules
- 06 AI behavior spec
- 08 seed scenarios

### Milestones 7–10
- 03 UX spec
- 05 scheduling rules
- 07 design system
- 09 acceptance tests

---

## Final rule
If Codex has to guess the product, the handoff is not specific enough.
If Codex can implement one milestone at a time and check it against concrete rules, the handoff is ready.
