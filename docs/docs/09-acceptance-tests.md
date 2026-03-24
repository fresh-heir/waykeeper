# 09 · Acceptance Tests

## A. Intake and parsing
### A1
Given a pasted multiline task list,
when the user submits it,
then the app returns structured tasks rather than only prose.

### A2
Given mixed tasks and hard events in the raw list,
then the parsed output distinguishes likely hard events from flexible tasks.

## B. Schedule generation
### B1
Given a planning window and one or more fixed events,
when a draft schedule is generated,
then no generated task blocks overlap fixed events.

### B2
Given deep work tasks and break preference,
then the generated schedule includes actual break blocks.

### B3
Given productive breaks selected,
then only low-effort break-eligible tasks are placed into productive break windows.

### B4
Given an overloaded day,
then the draft schedule warns that not everything fits or clearly defers lower-priority work.

## C. Timeline UX
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

## F. Persistence
### F1
Given a saved day plan,
when the page reloads,
then the user can resume the current plan without losing blocks or task status.

## G. Product fit
### G1
The generated schedule should be understandable as a day route, not a dump of tasks.

### G2
The app should reduce planning burden rather than adding more work than the day itself.
