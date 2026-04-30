# 10 · Codex Build Sequence — v1

This document turns the Waykeeper handoff pack into an implementation sequence for Codex. The goal is to reduce drift and prevent the planner from being built as a vague “AI productivity app.”
This sequence is the authoritative implementation order for future Codex tasks unless a later doc revision explicitly replaces it.

## Build strategy
Do not ask Codex to build the entire product in one prompt.
Use milestone-sized implementation passes with explicit acceptance checks.
Prompts should follow this order rather than overriding it ad hoc.
Local route and local replan usability should arrive before AI refinement becomes a critical-path dependency.

The recommended order is:
- Milestone 1 · app shell and timeline scaffold
- Milestone 1 refinement · layout correction and shell refinement
- Milestone 2 · intake flow and day setup
- Milestone 3 · interpretation placeholder and local route generation
- Milestone 4 · current / next awareness and timeline execution basics
- Milestone 5 · replan-from-now flow
- Milestone 6 · Carry Forward overflow handling
- Milestone 7 · real AI interpretation / scheduling integration
- Milestone 7.5 · Oracle Glow Up
- Milestone 8 · Route / List companion view
- Milestone 9 · polish and QA

Later milestones may extend overflow handling beyond the current day, but only after the one-day flow is stable.

## Roadmap gate
Milestone 8 is gated on route interaction maturity.

That means Route / List should not move ahead simply because it is the next named milestone. Before building it, Waykeeper should already feel behaviorally settled in Route:
- execution trust is strong
- delay / skip / complete behavior feels causal and legible
- replan outcomes are understandable in hindsight
- Oracle refinement does not make the planner feel slippery
- latency discipline keeps the app usable before AI finishes

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

## Milestone 1 refinement · Layout correction and shell refinement

### Goal
Correct the shell layout so the timeline, intake rail, and current-state panel support the real day-planning loop cleanly on desktop and mobile.

### Required outcome
- timeline, left rail, and right rail hierarchy read clearly
- timeline remains the visual center of gravity
- day setup and current / next context are both visible without crowding
- the shell supports later route-generation and replan work without structural rework

### Codex constraints
- preserve the day-first timeline emphasis
- solve layout clarity before adding deeper planner behavior
- keep refinements compatible with later intake, route, and replan milestones

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
- warning behavior for questionable inputs
- submit path into interpretation handoff
- preview timeline responds to planning window and fixed anchors

### Codex constraints
- accept messy multiline input
- do not over-structure the input UI
- fixed events should remain lightweight to enter

---

## Milestone 3 · Interpretation placeholder and local route generation

### Goal
Turn the intake handoff into a usable local route without depending on real AI yet.

### Required outcome
- deterministic or mock interpretation output remains usable enough to drive route building
- local route generation produces timeline blocks from interpreted tasks, planning window, and fixed anchors
- fixed-anchor handling is explicit and visible in the generated route
- break insertion is handled locally so the route reads like a real day rather than a packed task list
- generated route reads as a plausible day path rather than a loose task list
- overload and impossible-fit conditions surface honest local warnings
- timeline renders the generated route as the main screen state rather than a static placeholder
- basic current / next derivation is allowed only if needed to support the route-aware shell

### Codex constraints
- app state, not AI prose, is the source of truth
- do not block this milestone on real model integration
- prefer a legible route over a “smart” but brittle scheduler
- do not expand this milestone into rich execution interactions or live route-state editing

---

## Milestone 4 · Current / next awareness and timeline execution basics

### Goal
Add richer execution behavior on top of the generated route before full replanning exists.

### Required outcome
- current block state
- next block preview
- active / upcoming / done distinctions that stay legible
- execution actions such as mark complete, skip, or delay
- route state updates that respond cleanly to those actions without breaking the timeline model

### Codex constraints
- keep the “what now?” answer obvious at all times
- do not pull richer execution behavior forward into Milestone 3
- do not require the full replan system before adding lightweight execution state

---

## Milestone 5 · Replan from now

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

## Milestone 6 · Carry Forward overflow handling

### Goal
Add future-facing overflow handling for work that no longer fits today without replacing the main day timeline.

### Required outcome
- overflow detection when the remaining day cannot plausibly hold everything
- carry-forward queue or list for unfinished / unplaced work
- replan results that distinguish still-scheduled-today work from carried-forward work
- next-day intake of carried-forward tasks from the prior day
- prioritization rules for deciding what gets carried forward
- future warning behavior when a task would land after its due date or due time

### Codex constraints
- keep the daily timeline as the main execution surface
- do not turn Waykeeper into a week-view or shared calendar product
- preserve day-first clarity
- keep carried-forward items as optional next-day inputs, not a new planning center
- due-date and due-time guardrails may arrive in this later milestone rather than v1

---

## Milestone 7 · Real AI interpretation and scheduling integration

### Goal
Replace local placeholder logic with real AI assistance where it improves the established day-planning loop.

### Required outcome
- planner context assembled from app state
- structured interpretation request to model
- structured schedule or replan requests to model where appropriate
- structured responses parsed into app state
- local validation remains in front of canonical planner state
- AI outputs improve interpretation and route quality without changing the core workflow

### Codex constraints
- use structured outputs
- keep summaries secondary to structured planner data
- AI should strengthen the existing product loop, not redefine it
- do not let model integration become a prerequisite for basic route usability
- when validated local draft or replan results exist, let them become usable before any AI second pass finishes
- do not silently auto-apply late AI improvements over the visible route

---

## Milestone 7.5 · Oracle Glow Up

### Goal
Turn Oracle into the planner's interpretive side surface so the route stays visually central while execution meaning, action, and revision clarity become coherent.

### Required outcome
- Oracle default state shows current block, next block, immediate actions, and one or two concise live route insights
- Oracle briefly foregrounds after-action summaries after meaningful operations such as build, replan, delay, skip, complete, or meaningful manual edits
- Oracle can expand into a richer adjust or replan state with deeper route metrics only when the user is actively tuning the remainder
- existing current-block / next / replan side-rail utility is absorbed into Oracle behavior rather than duplicated beside it
- day-setup editing controls move to structural day controls rather than sitting in a live execution rail

### Codex constraints
- keep the timeline as the center of gravity
- do not turn Oracle into a chatbot, mascot, or floating AI companion
- do not create a second planner surface separate from the route
- do not make Oracle a noisy always-on metrics dashboard
- Oracle summaries must reflect actual planner deltas and say so plainly when no meaningful route change occurred
- Oracle should be the surface that presents late AI refinement offers as explicit compare / apply decisions

---

## Milestone 8 · Route / List companion view

### Goal
Add a future same-day companion view that lets the user inspect the day as an inventory without replacing the route as the main execution surface.

### Required outcome
- Route / List toggle for the same day
- Route remains the default and primary view
- List renders from the same planner state already used by the route
- List makes placed work, unplaced work, fixed anchors, and completed items easier to inspect
- later Carry Forward items can appear in the appropriate list section once that feature exists

### Codex constraints
- keep the timeline route as the center of gravity
- do not turn List into a board, backlog, or week view
- do not introduce a second planning system
- keep List as a same-day companion lens over the existing day state
- do not start this milestone until route interaction feels calm, trustworthy, and latency-disciplined in daily use

---

## Milestone 9 · Design polish and QA

### Goal
Apply the Waykeeper design language and verify behavior against the acceptance tests.

### Required outcome
- materials, type, spacing, iconography aligned to design system
- timeline remains legible
- fantasy motifs remain subtle
- no generic SaaS drift
- test main seed scenarios
- verify hard-event immovability
- verify overload honesty
- verify replan-from-now invariants
- verify timeline always answers “what now?”

### Codex constraints
- planner clarity first
- atmosphere second
- fantasy infusion must remain restrained
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

### Milestones 3–5
- 03 UX spec
- 04 data schema
- 05 scheduling rules
- 08 seed scenarios

### Milestones 6–7.5
- 03 UX spec
- 04 data schema
- 05 scheduling rules
- 06 AI behavior spec
- 08 seed scenarios

### Milestones 7.5–9
- 03 UX spec
- 05 scheduling rules
- 07 design system
- 09 acceptance tests
- 12 roadmap reset

---

## Final rule
If Codex has to guess the product, the handoff is not specific enough.
If Codex can implement one milestone at a time and check it against concrete rules, the handoff is ready.
