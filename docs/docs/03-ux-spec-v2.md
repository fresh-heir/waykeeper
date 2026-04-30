# 03 · Screen-by-Screen UX Spec — v2

## UX north star
Waykeeper is a timeline-first planner. The UI must make the day legible at a glance and make replanning feel contained rather than catastrophic.

The user should move through a clear loop:
1. capture the day
2. interpret tasks
3. generate a route
4. execute the current block
5. revise the remainder when needed

Implementation can reach this loop with local placeholder interpretation and local route generation before real AI integration is added.

---

## Global UX rules
- The timeline is the main screen.
- The timeline is the route; Oracle is the side surface for meaning, action, and revision clarity.
- Route remains the primary view even if a future same-day List companion view is added later.
- There should be one obvious primary action per screen.
- The app should always surface the current block and next block.
- Oracle should absorb most of the separate current-block / next / replan utility that would otherwise sit in a detached right rail.
- AI suggestions must remain editable.
- if a validated local route or remainder exists, it should become usable before AI finishes reviewing alternatives
- late AI improvements must be surfaced explicitly through Oracle as compare/apply options rather than silently replacing the visible route
- Replanning should feel like revising a route, not rebuilding the app state from scratch.
- The interface should feel finite, not like an infinite productivity inbox.

---

## Screen 1 · Welcome / Resume

### Purpose
Entry point for either creating today’s plan or resuming the current one.

### Primary user questions
- Am I starting fresh or continuing?
- What state is today already in?

### Required elements
- app name
- current date
- primary CTA: **Start today’s plan**
- secondary CTA: **Resume current plan** (only if a plan exists)
- short explanation of the product loop

### States
#### Empty state
No saved day yet. Emphasize paste-to-plan workflow.

#### Resume state
If a current day exists, show:
- current block title if any
- next block preview if any
- when the saved plan was last updated

### Primary action
Start or resume.

---

## Screen 2 · Day setup / Intake

### Purpose
Collect raw day input and planning constraints.

### Primary user questions
- What needs doing?
- What time do I actually have?
- What cannot move?
- What kind of breaks do I want today?

### Required elements
- large multiline paste field for raw task list
- planning window controls:
  - start time
  - end time
- break preference:
  - restful
  - productive
- fixed events section
  - add title
  - add start/end time
  - remove/edit event
- CTA: **Interpret tasks**

### Interaction notes
- the paste field should accept messy multiline input without formatting requirements
- fixed events should be easy to add without opening a heavy calendar flow
- the user should not be forced to assign detailed task metadata here

### Validation / edge cases
- empty raw input
- end time before start time
- fixed events outside planning window
- fixed events consuming entire day window

### Output
Moves to task interpretation once submitted.

---

## Screen 3 · Task interpretation / Review

### Purpose
Convert raw input into editable structured tasks before schedule generation.

Early milestones may satisfy this screen with deterministic placeholder interpretation before real AI-backed interpretation is wired in.

### Primary user questions
- Did the app understand my day correctly?
- How long do these things probably take?
- Which items are movable, optional, or break-eligible?

### Required elements
- list of interpreted tasks
- per-task editable fields:
  - title
  - type
  - estimated duration
  - priority
  - must do today
  - break-eligible
  - splittable
  - deferrable
- ability to delete or add tasks
- warnings / follow-up questions if needed
- CTA: **Build day plan**
- header or overflow action: **Edit day setup**

### UX rules
- the user should be able to fix obvious AI mistakes quickly
- duration should be visible and easy to change
- the screen should not feel like a database form; use lightweight rows/cards/sheets

### AI notes
If the AI needs clarifications, keep them minimal and specific.
Example:
- “Should grocery run stay today?”
- “Can review notes be split into smaller blocks?”

---

## Screen 4 · Draft timeline (main screen)

### Purpose
Primary working surface of the app.

Early milestones may reach this screen with locally generated route blocks before real AI scheduling is added.

### Primary user questions
- What is the shape of my day?
- What am I doing now?
- What is next?
- Where are my breaks and fixed events?

### Required elements
- day title / date
- structural day controls in header or overflow, including **Edit day setup**
- current time indicator line
- vertical time axis
- rendered schedule blocks with clear block types
- future Route / List toggle for the same day, with Route as the default
- visible distinction for:
  - focus blocks
  - productive or restful breaks
  - fixed events / appointments
  - admin / chore / self-care blocks
  - done / active / upcoming / skipped
- Oracle side panel as the primary interpretive side surface for:
  - current block
  - next block
  - immediate actions
  - concise live route insight

### Secondary actions on timeline
- start timer
- edit block

### Oracle behavior rules
- the timeline still has to answer “what now?” even if Oracle is ignored
- Oracle is where most current-block, next-block, and replan utility should live as the product matures
- Oracle should feel stateful, not like a generic assistant text box
- Oracle may use a subtle atmospheric backdrop layer or light day-part tinting, but scenic window-world treatment belongs to a later phase
- day-setup editing is structural navigation and should not sit at the bottom of a live execution rail

### Timeline behavior rules
- the screen should answer “what now?” immediately
- fixed events should read as immovable anchors
- breaks should not be visually invisible or collapsed into empty space
- if the day is overloaded, the timeline should show that honestly rather than hiding overflow
- if a future List companion view exists, both views must reflect the same underlying planner state rather than diverging into separate planning modes

### Empty / fallback states
If schedule generation fails, show:
- why
- what needs to be corrected
- return path to interpretation screen

---

## Oracle panel states

### Oracle · Default / Now mode
This is the normal execution state.

#### Required elements
- current block
- next block
- immediate actions:
  - mark complete
  - skip
  - delay options
  - replan / tune remainder
- one or two short live insights derived from planner state

#### Good insight types
- protect this block
- delay risk
- slack before next anchor
- likely first casualty if the route slips
- whether finishing on time preserves recovery later

#### UX rules
- keep the copy concise and calm
- this should read like a useful planner surface, not a chatbot response
- insight should be grounded in route state, not generic commentary

### Oracle · After-action / What changed mode
After meaningful operations, Oracle may foreground a concise change summary before returning to default mode.

#### Triggering operations
- initial draft build
- replan from now
- delay current block
- skip block
- mark complete
- meaningful manual route edits
- late AI second-pass improvements becoming ready

#### Required behavior
- the summary should explain actual planner deltas such as what was preserved, moved, deferred, dropped, or protected
- if no meaningful route change occurred, Oracle should say so plainly rather than manufacturing insight
- this is a transient foregrounded state unless the product explicitly lets the user pin or hold it
- if AI finishes after the visible local route is already on screen, Oracle should frame it as a second-pass option, not as the route having quietly changed underneath the user

### Oracle · Adjust / Replan mode
When the user actively revises the day, Oracle expands into a richer analytical state.

#### Required elements
- current boundary
- locked anchors ahead
- flexible blocks or tasks ahead
- overload, slack, or fragmentation signals
- replan mode options
- **Generate revised plan** CTA

#### UX rules
- deeper metrics belong here, not as ambient clutter in the default execution state
- this is still route revision, not a separate planning system
- if a local replan preview is already visible, any later AI option should appear as an explicit alternative preview rather than replacing the visible one automatically

---

## Screen 5 · Block detail / Edit sheet

### Purpose
Inspect and modify a single schedule block.

### Primary user questions
- What is this block?
- Can I change it?
- What happens if I delay or complete it?

### Required elements
- block title
- block type
- linked task
- start/end time
- estimated remaining time if active
- status
- edit actions:
  - mark complete
  - delay by X minutes
  - change duration
  - move block
  - skip block
  - defer task

### UX rules
- manual edits should update local plan state without forcing immediate AI rewrite
- destructive actions should be clear but lightweight
- delay action should be easy because it is common

---

## Screen 6 · Replan from now sheet / Oracle adjust state

### Purpose
Revise only the unfinished remainder of the day.

### Primary user questions
- What has already happened?
- What still remains?
- How should the rest of the day change?

### Required elements
- current time summary
- completed blocks summary
- active/late block summary if relevant
- remaining task summary
- fixed events still ahead
- replan mode options:
  - replan from now
  - keep essentials only
  - make the rest gentler
  - use productive breaks
  - preserve focus work first
- CTA: **Generate revised plan**
- confirmation step before replacing remainder

### UX rules
- completed history must remain visually separate from the revised future
- the user must understand that the revision applies from the current time onward
- the sheet should clearly surface dropped or deferred tasks after the replan
- if some work no longer fits, the result should split clearly into:
  - still scheduled today
  - carried forward
- if a task would be scheduled or carried forward past its due date or due time in a future version, the UI should warn explicitly rather than allowing that silently
- when this state is surfaced through Oracle, it should expand the side panel rather than create a second competing control stack

### After success
Return to timeline with:
- updated remaining blocks
- preserved past blocks
- visible “revised” marker if helpful
- visible carry-forward summary if any remaining tasks were moved out of today
- Oracle briefly foregrounding a concise summary of what actually changed before returning to default mode

### Future carry-forward actions
When Carry Forward exists, the replan result should make overflow legible and actionable:
- still-scheduled-today items remain on the timeline
- carried-forward items appear in a separate overflow list
- each carried-forward item should explain why it moved, such as lack of remaining room or lower urgency
- the user should be able to review what moved instead of discovering it later by accident

---

## Future companion view · Same-day Route / List toggle (not in v1)

### Purpose
Give the user a secondary same-day inventory lens without replacing the timeline-first route.

### Primary user questions
- What is placed in today already?
- What still has not been placed?
- Which fixed anchors are shaping the day?
- What is done already?

### Required elements
- clear Route / List toggle within the main day-planning experience
- Route remains the default and primary view
- List renders from the same underlying planner state as Route
- list sections for:
  - Placed today
  - Not yet placed
  - Fixed anchors
  - Completed
  - later, Carry Forward when that feature exists

### UX rules
- this is a same-day companion lens, not a separate planning system
- this is not a kanban board, workspace, or week view
- List should reduce time-grid pressure when the user needs to inspect the day as an inventory
- unplaced work should remain especially legible in List view
- switching between Route and List must not make items disappear or appear to belong to different planner states

### Relationship to the route
- Route remains the main execution surface
- List is a secondary review / triage view for the same day
- edits or state changes should reflect consistently in both views because they share one source of truth
- later Carry Forward triage may surface naturally in List view, but only as part of the same day-first planner model

---

## Screen 7 · Active block view / Focus state

### Purpose
Support execution during the current block without leaving the planner context.

### Primary user questions
- What am I doing right now?
- How much time is left?
- What comes next?
- What do I do if this runs long?

### Required elements
- current block title
- linked task context
- start/end time
- countdown or elapsed/remaining timer
- next block preview
- actions:
  - mark complete
  - needs more time
  - end early
  - replan from now

### UX rules
- this screen should be simpler than the timeline screen
- it should support execution, not planning
- if the user needs more time, the follow-up should be obvious and low-friction
- if this view exists, it should not replace Oracle as the main interpretive surface for revision clarity

---

## Screen 8 · Settings / Preferences

### Purpose
Control baseline planner behavior without cluttering the core loop.

### Required elements
- default break mode
- default planning window if desired later
- optional AI behavior preferences
- storage / reset day controls

### Explicitly not needed in v1
- theme playground
- complex account management
- advanced project settings

---

## Future flow · Carry Forward overflow intake (not in v1)

### Purpose
Provide a constrained overflow handoff from one day into the next without replacing the day-first execution model.

### Primary user questions
- What rolled over from yesterday?
- Which of these items should come into today's plan?
- What should I review before accepting?
- What can I ignore for now?

### Required elements
- carried-forward items section surfaced during next-day intake
- clear "from yesterday" labeling
- each item showing enough context to understand why it carried forward
- optional due-date or due-time warning state
- actions:
  - **Add to today**
  - **Review first**
  - **Ignore for now**
- CTA examples:
  - **Add selected to today**
  - **Review carried-forward items**
  - **Skip for now**

### UX rules
- this is not a week view or future calendar grid
- it should remain personal, quiet, and planner-like
- it should not replace the one-day timeline as the main execution surface
- it should stay lighter than a multi-day planning board
- the user should be able to see overflow and next-day intake choices without drowning in details
- if a carried-forward item would now sit past its due point, the warning should be visible before acceptance

### Relationship to the main timeline
- the main daily timeline remains the primary working surface
- Carry Forward is only an optional input into the next day's planning flow
- accepting a carried-forward item should feed the normal day-planning process rather than create a separate future-planning surface

---

## Core navigation model
For v1, navigation should be minimal:
- Welcome / Resume
- Day setup
- Task interpretation
- Timeline
- Block detail sheet
- Replan sheet
- Active block view
- Settings

Oracle is part of the timeline screen rather than a separate navigation destination.
Day setup editing controls belong in header-level or overflow day controls, not in a bottom-of-rail execution stack.

Avoid tabs unless truly necessary. The product loop is sequential and modal enough that simple routes + sheets are cleaner.

---

## UX behavior rules for delays and slips
Because schedule drift is central to the app, these interactions must be easy:
- mark current block complete
- delay current block by 10/15/30 minutes
- say “I finished this at [time]”
- replan from now

The user should never need to manually rebuild the entire second half of the day just because one block ran late.

---

## UX success checks
The UX is working if:
- the timeline is the obvious center of gravity
- the current and next blocks are always visible
- Oracle makes execution and revision intent clearer without becoming a second planner
- editing feels lighter than starting over
- replanning feels contained
- the user never has to guess where to go next in the flow
