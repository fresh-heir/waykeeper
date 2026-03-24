# 03 · Screen-by-Screen UX Spec — v2

## UX north star
Waykeeper is a timeline-first planner. The UI must make the day legible at a glance and make replanning feel contained rather than catastrophic.

The user should move through a clear loop:
1. capture the day
2. interpret tasks
3. generate a route
4. execute the current block
5. revise the remainder when needed

---

## Global UX rules
- The timeline is the main screen.
- There should be one obvious primary action per screen.
- The app should always surface the current block and next block.
- AI suggestions must remain editable.
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
- secondary CTA: **Back to day setup**

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

### Primary user questions
- What is the shape of my day?
- What am I doing now?
- What is next?
- Where are my breaks and fixed events?

### Required elements
- day title / date
- current time indicator line
- vertical time axis
- rendered schedule blocks with clear block types
- visible distinction for:
  - focus blocks
  - productive or restful breaks
  - fixed events / appointments
  - admin / chore / self-care blocks
  - done / active / upcoming / skipped
- current block summary pinned near top or now-line area
- next block preview
- primary CTA near now: **Replan from now**

### Secondary actions on timeline
- start timer
- mark complete
- delay
- skip
- edit block

### Timeline behavior rules
- the screen should answer “what now?” immediately
- fixed events should read as immovable anchors
- breaks should not be visually invisible or collapsed into empty space
- if the day is overloaded, the timeline should show that honestly rather than hiding overflow

### Empty / fallback states
If schedule generation fails, show:
- why
- what needs to be corrected
- return path to interpretation screen

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

## Screen 6 · Replan from now sheet

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

### After success
Return to timeline with:
- updated remaining blocks
- preserved past blocks
- visible “revised” marker if helpful

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
- editing feels lighter than starting over
- replanning feels contained
- the user never has to guess where to go next in the flow
