# 09 · Acceptance Tests

These are end-to-end behavior checks for the product, but they should be read in the milestone order defined by the build sequence.
Early milestones may satisfy interpretation and route-building behavior with local deterministic logic before real AI integration is added.

## A. Intake and day setup
### A1
Given a pasted multiline task list,
when the user submits it,
then the app moves into an interpretation handoff rather than stopping at raw text only.

### A2
Given mixed tasks and hard events in the raw list,
then day setup, validation, or interpretation handoff distinguishes fixed anchors from flexible work clearly enough to continue building the route.

## B. Local route generation
### B1
Given a planning window and one or more fixed events,
when a draft schedule is generated,
then no generated route blocks overlap fixed events.

### B2
Given deep work tasks and break preference,
then the generated schedule includes actual break blocks.

### B3
Given productive breaks selected,
then only low-effort break-eligible tasks are placed into productive break windows.

### B4
Given an overloaded day,
then the draft schedule warns that not everything fits or clearly defers lower-priority work.

## C. Timeline UX and route legibility
### C1
The main timeline must render:
- current time marker
- active block
- upcoming blocks
- completed blocks

### C2
At all times, the interface must make the current task and next block legible.

## D. Manual editing
### D1
Given a scheduled block,
when the user edits its timing or marks it complete,
then the day state updates without corrupting completed history.

## E. Replanning
### E1
Given some completed blocks and a new current time,
when the user selects Replan from now,
then completed blocks remain unchanged and only the remaining day is revised.

### E2
Given hard events,
replanning must not move them.

### E3
Given keep-essentials-only mode,
lower-priority or deferrable work should be dropped before essential work is removed.

## F. Oracle execution surface
### F1
Given the user is in normal execution state,
then Oracle shows the current block and next block without requiring the user to open a separate planning surface.

### F2
Given a live block is active,
then Oracle exposes immediate actions such as mark complete, skip, delay, and replan or tune remainder.

### F3
Given a meaningful route operation such as initial build, replan, delay, skip, complete, or manual route edit,
then Oracle briefly foregrounds a concise summary of the actual planner change before returning to default mode unless intentionally held.

### F4
Given no meaningful route change occurred,
then Oracle says so plainly instead of manufacturing insight.

### F5
Given Oracle explains a revision,
then that explanation must match actual planner deltas such as preserved anchors, protected work, moved blocks, or deferred work.

### F6
Given the user is not actively adjusting the day,
then deeper route metrics remain hidden rather than appearing as always-on ambient clutter.

### F7
Given day setup editing is available,
then that control is presented as a header-level or day-level editing action rather than as a bottom-of-rail live execution action.

## G. Carry Forward and later-stage behavior
### G1
Given a remainder that cannot plausibly fit inside the usable day,
when Carry Forward exists,
then some work is surfaced as carried forward rather than being compressed unrealistically.

### G2
Given a task with a known due date or due time,
when the app would schedule or carry it past that point in a later milestone,
then the user receives a visible warning.

## H. Route / List companion view
### H1
Given a same-day Route / List companion view exists in a later milestone,
when the user switches between Route and List,
then both views reflect the same underlying planner state.

### H2
Given placed blocks, unplaced work, fixed anchors, and completed items,
when the user opens List view,
then those items remain visible in the appropriate same-day list sections rather than disappearing between views.

### H3
Given Carry Forward exists in a later milestone,
when carried-forward items are present,
then they appear consistently in the appropriate list section alongside the same day state.

## I. Persistence
### I1
Given a saved day plan,
when the page reloads,
then the user can resume the current plan without losing blocks or task status.

## J. AI integration
### J1
Given real AI interpretation is enabled in a later milestone,
when the user submits a pasted multiline task list,
then the app returns structured tasks rather than only prose.

### J2
Given real AI scheduling is enabled in a later milestone,
when the app generates or replans a route,
then model outputs still respect the app’s route constraints and validation rules.

### J3
Given AI draft mode and a validated local route exists,
when the user builds the day,
then the validated local route becomes usable before any AI refinement is required.

### J4
Given AI replan mode and a validated local remainder preview exists,
when the user generates a revised plan,
then the local preview becomes usable before any AI refinement is required.

### J5
Given AI returns a materially different validated second-pass route,
then Oracle presents it as an explicit compare / apply offer and the visible route does not change until the user applies it.

### J6
Given AI returns a materially different validated second-pass remainder,
then Oracle presents it as an explicit compare / apply remainder option and the visible preview does not change until the user applies it.

### J7
Given AI finds no meaningful validated improvement,
then the visible route or preview remains in place and the product says so plainly instead of pretending a change occurred.

## K. Execution trust
### K1
Given the user delays a block,
then the resulting route change remains understandable in hindsight rather than feeling arbitrary.

### K2
Given the user skips a block,
then the skip does not create hidden planner logic or unexplained route mutations.

### K3
Given work is carried forward,
then the result feels explicit and psychologically fair rather than punitive or mysterious.

### K4
Given the user completes, skips, delays, or replans,
then Oracle summaries match the actual planner deltas instead of generic narration.

## L. Product fit
### L1
The generated schedule should be understandable as a day route, not a dump of tasks.

### L2
The app should reduce planning burden rather than adding more work than the day itself.
