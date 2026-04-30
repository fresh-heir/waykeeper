# 01 · Product Overview

## Working name
Waykeeper

## One-sentence description
Waykeeper is an AI-assisted daily planner that turns a messy to-do list into a realistic timeline with adaptive focus blocks, intelligent breaks, and explicit replanning when the day slips.

## Product problem
Most planning tools assume the user already knows:

- how long each task will take
- what order the tasks should happen in
- which tasks are actually compatible with a given day
- how to recover when the day goes off plan

In practice, users often begin with a chaotic, uneven, emotionally loaded brain dump. They need help converting that chaos into a believable route through the day.

## Product solution
Waykeeper helps the user:

1. paste a messy list of tasks, errands, obligations, and appointments
2. define a time window and fixed events
3. receive a draft plan with work blocks, breaks, and realistic ordering
4. follow the plan in a linear timeline view, with an Oracle side surface that helps interpret what matters now
5. revise the rest of the day when they fall behind

## Product principles

### 1. One-day planning only in v1
Waykeeper is for today. It is not a project manager, a multi-week planner, or a life OS.

### 2. Timeline first
The main surface is a vertical day timeline. The app should always answer: **what am I doing now, and what comes next?**
The timeline is the route; Oracle is the interpretive side surface that explains the route without replacing it.

### 3. AI assists; the app owns state
The model can parse, classify, estimate, and propose schedules. The application owns the structured data, timeline state, edits, and persistence.

### 4. Replanning is explicit
The app should not silently rewrite the day every few minutes. Replanning is user-triggered and legible.

### 5. Breaks are part of the schedule, not an afterthought
Breaks should be scheduled intentionally. The user can choose restful breaks or productive breaks.

### 6. Planner temperament matters
Waykeeper should feel:
- calm
- exact
- non-performative
- humane without fake encouragement

It should not drift into:
- productivity-mascot energy
- theatrical AI tone
- motivational software language
- chatty assistant behavior that competes with the route

### 7. Trust must accumulate through repeated days
Waykeeper should become more legible and dependable the more the user lives in it.

That means:
- no surprising route mutations
- delay, skip, complete, and replan should preserve understandable causality
- carry-forward should feel fair rather than punitive
- AI should refine the route, not make the product feel slippery

## Core feature pillars

### Intake
- Paste-in to-do list
- Planning window
- Fixed appointments/events
- User preference for break style

### AI interpretation
- Task parsing
- Duration estimation
- Task classification
- Break eligibility detection
- Draft schedule generation

### Planning interface
- Linear timeline view
- Oracle side surface for current / next context, immediate actions, and revision summaries
- Editable schedule blocks
- Clear current/next state
- Task-to-block traceability

### Adaptive revision
- Replan from now
- Preserve completed work
- Respect fixed events
- Carry forward or drop lower-priority tasks when necessary

## Relationship to Time Sanctuary
Waykeeper is separate from Time Sanctuary.

- Waykeeper determines the plan.
- Time Sanctuary can later enforce focus on the current block.

In v1, Waykeeper should stand on its own.

## V1 non-goals
- Projects
- Subtasks
- Team collaboration
- Full calendar sync
- Habit tracking
- Tags/labels everywhere
- Multi-day planning
- Life analytics

## Success criteria
Waykeeper succeeds if a user can:

- paste a messy to-do list
- define a planning window
- receive a believable timeline
- understand what to do now
- recover when they get behind
- finish the day feeling more oriented, not more managed
