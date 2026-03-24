# 05 · Scheduling Rules — v2

This document defines the deterministic scheduling logic around the AI layer. The AI may propose interpretations and draft schedules, but the application must still enforce a consistent planning model.

Waykeeper is a one-day planner. The point is not to perfectly fill every minute. The point is to produce a believable day route that can survive contact with reality.

---

## 1. Scheduling philosophy

### Core rule
Prefer a day plan that remains usable after the first delay over a maximally packed schedule that collapses immediately.

### Scheduling priorities
The engine should generally prioritize in this order:
1. hard events
2. must-do-today tasks
3. high-priority deep work
4. medium-priority admin / chore / self-care tasks
5. optional or deferrable items

### Interpretation rule
The schedule must answer these questions at all times:
- what is happening now?
- what happens next?
- what is fixed?
- what can still move?
- what can no longer fit today?

---

## 2. Day structure assumptions

### v1 planning unit
Waykeeper plans a single day inside a user-defined planning window.

### Day model
A day is made of:
- hard events
- focus blocks
- break blocks
- lighter support blocks (admin / chore / self-care)
- optional buffer or transition blocks when appropriate

### Realism rule
Do not assume the user can perform high-focus work continuously across the entire planning window.

---

## 3. Hard events

Hard events are schedule anchors.

### Rules
- hard events are placed first
- hard events cannot be moved by AI schedule generation or replanning
- no generated block may overlap a hard event
- if a hard event lies partly outside the planning window, warn the user and constrain visible schedule generation to the planning window
- if hard events consume almost the whole day, surface that clearly instead of pretending a full task schedule still fits

### Examples
Hard events may include:
- appointments
- classes
- meetings
- travel windows
- meals if explicitly entered as fixed

---

## 4. Task ordering and placement

### Must-do logic
Tasks marked `mustDoToday = true` should be preserved as long as the day can plausibly contain them.

### Deep work placement
Deep work should usually be placed:
- earlier in the day rather than later, unless user constraints suggest otherwise
- before lower-value admin/chore tasks
- in larger uninterrupted blocks when possible

### Lighter work placement
Admin, chores, errands, and self-care may be placed:
- between deeper blocks
- after hard events
- inside productive break logic if explicitly eligible
- later in the day if they do not need the user’s highest attention

### Optional task handling
Optional or deferrable work should be the first thing removed when the day becomes overloaded.

---

## 5. Block sizing rules

Waykeeper is not a rigid 25/5 Pomodoro clone. Focus blocks should be sized based on the task and the day.

### Suggested default ranges
- deep work: 45–90 minutes
- admin: 15–45 minutes
- chores: 10–30 minutes
- self-care: based on task estimate
- errands: based on task estimate and travel assumptions if entered

### Block sizing principles
- avoid fragmentation when possible
- avoid overly long blocks for cognitively demanding work unless user intent clearly supports it
- protect meaningful focus duration without assuming heroic endurance
- use smaller blocks when the task is inherently fragmented or when the day is already broken up by fixed events

### Splittable tasks
If `splittable = true`:
- the task may be broken across multiple blocks
- each block should remain legible in the timeline
- avoid excessive fragmentation
- do not split a task into many tiny blocks just to make everything fit

### Non-splittable tasks
If `splittable = false`:
- place as one contiguous block when possible
- if it cannot fit, surface that problem rather than silently fragmenting it

---

## 6. Break rules

Breaks are part of the schedule, not empty leftover space.

### Baseline break logic
As a default pattern:
- after 45–60 minutes of high-focus work: insert a short break opportunity
- after 2–3 substantial focus blocks: insert a longer break opportunity or meal window
- do not schedule an uninterrupted chain of demanding blocks across the whole day

### Break visibility rule
Breaks should appear explicitly on the timeline. The user should not have to infer them from blank space.

### Break realism rule
Do not place demanding cognitive work inside a break and label it a break.

---

## 7. Restful vs productive breaks

### Restful breaks
Use restful breaks for:
- snack
- hydration
- stretch
- short walk
- meal
- low-stimulation reset
- basic recovery

### Productive breaks
Productive breaks may include only low-cognitive-load tasks such as:
- dishes
- tidy surface
- refill water
- one short email
- laundry transfer
- take medication
- quick household/admin maintenance

### Productive break rules
- only tasks with `breakEligible = true` may be placed in productive breaks
- productive-break tasks must be low-effort and brief
- productive-break tasks must not replace actual rest for the entire day
- productive-break placement is allowed only when the user selected productive breaks or explicitly invoked a replan mode that uses them

---

## 8. Buffers and transitions

Waykeeper may use small explicit buffer or transition blocks when useful.

### When to use them
- between a hard event and a focus block when the timeline would otherwise be unrealistically tight
- after long demanding work before the next commitment
- during replanning when the day needs more breathing room

### Rules
- do not fill every unused minute automatically with a task
- small schedule gaps are allowed
- transition blocks should not become visual noise

---

## 9. Overload rules

A day is overloaded when:
- the estimated required time exceeds what can plausibly fit inside the planning window after hard events and reasonable breaks
- or the only way to fit everything would require unrealistic fragmentation or omission of all recovery

### Overload response
When the day is overloaded:
- preserve hard events
- preserve must-do tasks first
- preserve the highest-value focus work next
- defer lower-priority deferrable tasks before compressing essential work excessively
- surface what was deferred or dropped
- warn the user clearly instead of pretending all items still fit

### Important
Waykeeper should not “solve” overload by silently shortening every task unrealistically.

---

## 10. Manual edits

User edits are first-class state.

### Rules
- user edits should not be immediately overwritten by AI
- AI replanning must start from the edited schedule state, not from the original generated schedule
- if a block was manually moved or resized, preserve that choice unless the user explicitly asks for a broader revision
- if the user locks a block in a later version, treat it like a soft anchor

---

## 11. Replan from now

Replanning is explicit and only affects the unfinished remainder of the day.

### Replan invariants
When replanning:
- preserve completed blocks as immutable history
- preserve hard events
- preserve the user’s current time as the new boundary
- revise only the remaining portion of the day
- do not silently erase completed or skipped work from history

### Active block handling
If the user is currently inside a block and asks to replan:
- preserve the fact that the block happened
- reflect actual finish time if provided
- revise the remainder from the new current time onward

---

## 12. Replan modes

### `replan_from_now`
Rebuild the remaining day using existing priorities and constraints.

### `keep_essentials_only`
Before compressing everything, drop optional and lower-priority work so must-do items and fixed commitments remain plausible.

### `gentler_remainder`
Reduce ambition. Use fewer commitments, more breathing room, and less compression in the remainder of the day.

### `use_productive_breaks`
Allow break-eligible light tasks to occupy some break windows. Still preserve actual recovery opportunities.

### `preserve_focus_first`
Protect remaining high-value focus work first and push lighter work later or out of the day if necessary.

---

## 13. Current-moment clarity

At all times, the app should be able to derive and display:
- current block
- next block
- completed blocks
- skipped / deferred items
- remaining tasks not yet placed

If the schedule can no longer answer “what am I doing now?” the planner state has failed.

---

## 14. Schedule integrity checks

A generated or revised schedule should be rejected if it violates any of the following:
- overlaps a hard event
- places blocks outside the planning window without explicit support
- drops a must-do task without warning
- uses productive breaks for high-effort work
- fragments splittable work into unreadable micro-blocks
- rewrites completed history during replanning
- creates a day with no meaningful breaks
- cannot identify a current/next block state

---

## 15. Implementation stance

The AI may suggest:
- duration estimates
- task class
- block ordering
- break placement
- overload warnings
- replan revisions

The app should still enforce:
- hard event immovability
- timeline integrity
- replan invariants
- visible history
- explicit break logic
- state transitions

The rule of thumb is:
AI proposes the route; the application keeps the map coherent.
