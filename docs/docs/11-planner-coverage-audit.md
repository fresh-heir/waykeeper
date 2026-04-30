# 11 · Planner Coverage Audit And Modernization Plan

This document is the implementation-ready coverage matrix for the current planner.
It reflects:

- the milestone order in [10-codex-build-sequence.md](10-codex-build-sequence.md)
- the behavioral contract in [09-acceptance-tests.md](09-acceptance-tests.md)
- the current planner UI vocabulary
- the current Playwright suite in `tests/e2e/planner.spec.ts`
- the deterministic regression suite in `scripts/planner-regression-check.ts`
- the current scenario catalog in `src/app/_lib/planner/dev-scenarios.ts`

Use this doc as the source of truth for planner QA modernization work.

## How to read this audit

Each milestone section includes:

- goal
- acceptance references
- covered well
- partially covered
- stale / mismatched coverage
- missing coverage
- proposed additions
- confidence

### Bucket meanings

- `covered well`: current tests match the current UI and verify the intended contract directly
- `partial`: the behavior is exercised, but only indirectly, only in one layer, or with weak assertions
- `stale`: the behavior is still being tested, but the test shape has historically drifted against current UI/state assumptions
- `missing`: the docs require the behavior, but there is no meaningful current coverage

### Current UI vocabulary to prefer

Use the current planner surfaces and labels, not older ones:

- `oracle-panel`
- `Adjust remainder`
- `Edit day setup`
- `carry-forward-intake`
- `carry-forward-intake-ignored`
- `current-card`
- `next-card`
- dedicated AI diagnostics panels instead of Oracle prose for AI details

### Current scenario catalog in code

The current live scenario catalog is richer than `08-seed-scenarios.md`. The active scenario list in code is:

- `Normal realistic day`
- `Overloaded liar-detector day`
- `Next-day carry-forward intake test`
- `Partially time-anchored interpretation test`
- `Ambiguous human-chaos input test`
- `Spread-out slack day`
- `AI draft believability comparison`
- `Deep-work fragmentation torture test`
- `Low-energy productive-break test`
- `Granular short-task pileup test`
- `Late-day replan stress test`
- `AI stale-route replan comparison`
- `Execution continuity test`
- `End-of-window impossible fit test`

This mismatch is itself a docs/scenario-alignment task in the backlog below.

---

## M1 / M1 Refinement · App Shell, Timeline Scaffold, Layout Correction

**Goal**
Keep the timeline as the visual center of gravity while the shell stays usable on desktop and tablet with Oracle and day controls visible.

**Acceptance references**

- C1
- C2
- F7

**Covered well**

- Playwright:
  - `keeps the desktop route focused on timeline and immediate actions`
  - `keeps the visible timeline aligned with the next card`
  - `keeps the granular short-task route stable on desktop and tablet`
  - `uses the timeline as the only bounded scroll surface in route mode`
  - `keeps timeline auto-focus restrained`
- Regression:
  - repeated `assertGeneratedRouteIsValid(...)` coverage across built routes
  - spread-out and execution scenarios validate route structure after multiple mutations
- Scenario dependencies:
  - `Normal realistic day`
  - `Granular short-task pileup test`
  - `Spread-out slack day`

**Partially covered**

- Mobile responsiveness is only weakly represented via tablet-sized coverage.
- The shell hierarchy is tested mostly from route mode, not from earlier intake/setup states.

**Stale / mismatched coverage**

- Route-shell tests can drift whenever Oracle layout or replan entry states change, especially if they depend on specific button placement rather than stable panels.

**Missing coverage**

- No explicit headed test for small-phone layout behavior.
- No explicit test that the shell remains legible when developer tools are closed and diagnostics are absent.

**Proposed additions**

- Playwright:
  - Add a phone-width route-shell test using `Normal realistic day`.
  - Verify timeline, Oracle, and day header remain readable without overlapping or double-scroll behavior.
  - Pass condition: timeline remains primary and `oracle-panel` remains visible or intentionally collapsible without losing current/next legibility.
  - Anti-pattern: pixel-perfect position assertions.
- Playwright:
  - Add a setup-state shell test that verifies planning inputs, inferred anchors, and day controls remain scannable before route build.
  - Scenario: `Partially time-anchored interpretation test`.

**Confidence**

- `medium`

---

## M2 · Intake Flow And Day Setup

**Goal**
Keep messy intake, planning-window setup, anchor entry, and early interpretation handoff fast, editable, and honest.

**Acceptance references**

- A1
- A2

**Covered well**

- Playwright:
  - `keeps the partial-time interpretation flow interactive`
  - `keeps draft form state stable across rerender-like interactions`
  - `keeps anchor presence truthful while anchor rows exist`
  - `supports keyboard-first setup and interpretation controls`
  - `surfaces planning-window and incomplete-fixed-event validation`
- Regression:
  - compact due shorthand parsing
  - slash-style due parsing
  - accepted due/time edits survive build -> back -> interpret
  - legacy hydration preserves setup-derived fields sanely
- Scenario dependencies:
  - `Partially time-anchored interpretation test`
  - `Ambiguous human-chaos input test`

**Partially covered**

- Intake-to-interpretation handoff is well covered for editable flows, but not for the simplest “paste and continue” case.
- Fixed-anchor distinction is covered through prompts and validations more than through one clean A2-style end-to-end assertion.

**Stale / mismatched coverage**

- Tests in this area historically drift when review-stage controls change label or move from form-wide fields to in-card controls.

**Missing coverage**

- No explicit Playwright smoke test for a minimal multiline paste flowing straight into interpretation.
- No explicit headed test that raw input containing a fixed event is surfaced clearly enough to continue even before AI/local interpretation refinement.

**Proposed additions**

- Playwright:
  - Add a minimal A1 smoke test: paste 2 flexible tasks, press `Interpret tasks`, assert review stage appears.
  - Stable surface: review heading plus `task-intake-panel`.
- Playwright:
  - Add a focused A2 test: mixed flexible work plus one explicit hard event should show a clear anchor distinction before build.
  - Preferred scenario: a new small setup-only scenario or a simplified variant of `Partially time-anchored interpretation test`.
  - Anti-pattern: asserting exact helper prose instead of visible continuation affordances.

**Confidence**

- `medium`

---

## M3 · Interpretation Placeholder And Local Route Generation

**Goal**
Produce a believable local day route that respects anchors, break behavior, overload honesty, and pacing without requiring real AI.

**Acceptance references**

- B1
- B2
- B3
- B4
- K1

**Covered well**

- Playwright:
  - `supports spread-out pace mode with visible open time buffers`
  - `does not duplicate locked anchor labels in the timeline`
  - `shows honest overflow for overloaded days`
- Regression:
  - route validity and task-minute accounting
  - spread-out pace ordering and visible open-time buffers
  - productive-break behavior retains at least one true break in the low-energy scenario
  - due-protection tradeoffs in overloaded local routes
- Scenario dependencies:
  - `Spread-out slack day`
  - `Overloaded liar-detector day`
  - `Low-energy productive-break test`

**Partially covered**

- Productive-break placement is strongly covered in deterministic checks, but only lightly in headed UI.
- Hard-event non-overlap is asserted heavily in regression checks, not directly in a user-visible route assertion.

**Stale / mismatched coverage**

- Overload tests can drift if they depend on Oracle’s compact metrics layout rather than durable overflow semantics.

**Missing coverage**

- No explicit headed test that deep work is excluded from productive break windows.
- No explicit headed test that hard events remain untouched in the local draft route.

**Proposed additions**

- Playwright:
  - Add a productive-break route test using `Low-energy productive-break test`.
  - Verify at least one real break remains and no deep-work task is shown inside productive break windows.
- Playwright:
  - Add a local-route hard-event protection test using `Normal realistic day` or a smaller anchor-heavy scenario.
  - Pass condition: route blocks before and after the anchor stay intact and the anchor block remains fixed.
- Deterministic regression:
  - Keep B1/B2/B3/B4-style local-route invariants in the regression suite as the stronger source of truth.

**Confidence**

- `medium`

---

## M4 · Current / Next Awareness And Timeline Execution Basics

**Goal**
Make “what now?” and “what next?” obvious while execution mutations update planner state without corrupting history.

**Acceptance references**

- C1
- C2
- D1
- F1
- F2
- I1

**Covered well**

- Playwright:
  - `hides execution actions during a locked anchor`
  - `keeps route actions and replan controls keyboard reachable`
  - `keeps execution state coherent across completion and reload`
  - `hydrates persisted route state on a cold page load`
- Regression:
  - execution continuity cluster for skip / complete / delay
  - completed-task future blocks removed after completion
  - locked upcoming blocks reject skip / complete / delay
  - current-time state derivation across open time, active task, end-of-route, and locked states
- Scenario dependencies:
  - `Execution continuity test`
  - `Normal realistic day`

**Partially covered**

- Manual editing is more heavily covered through review/build-back flows than through explicit live-route editing.
- Reload persistence is good for route state, but not fully split between route, intake, and AI diagnostics concerns in one matrix.

**Stale / mismatched coverage**

- Current/next tests can become brittle if they pin exact titles after route mutations instead of verifying structural continuity.

**Missing coverage**

- No explicit headed test that `Skip` and `Delay` surface the right warning behavior for invalid targets.
- No explicit headed test that manual route edits preserve completed history after later reload.

**Proposed additions**

- Playwright:
  - Add a live execution warning test using `Execution continuity test`.
  - Verify locked upcoming blocks reject skip/complete/delay with visible warning surfaces.
- Playwright:
  - Add a manual-route-edit persistence test once a stable edit surface exists in route mode.
- Deterministic regression:
  - Keep continuity, locked-anchor action rejection, and completed-history preservation here as the main integrity layer.

**Confidence**

- `high`

---

## M5 · Replan From Now

**Goal**
Revise only the unfinished remainder while preserving completed history, hard events, and route legibility.

**Acceptance references**

- E1
- E2
- E3
- F3
- F4
- F5

**Covered well**

- Playwright:
  - `supports replan preview generate, cancel, and apply`
  - `supports every replan mode and persists an applied replan across reload`
  - `keeps replan preview accounting internally consistent`
  - `replan from now keeps missed work visible in the remainder`
  - `resets replan mode to the base option on rebuild`
- Regression:
  - late-day replan validity and stayed-out accounting
  - missed unfinished past work is recaptured into the remainder
  - completed history is preserved
  - spread-out replan keeps pace mode and visible open-time buffers
  - hard events remain fixed through replanning
- Scenario dependencies:
  - `Late-day replan stress test`
  - `Execution continuity test`
  - `Spread-out slack day`

**Partially covered**

- Keep-essentials-only behavior is currently validated more through counts than through visible task-level tradeoffs.
- Replan cancel/apply/reopen flows are covered, but the exact Oracle-summary truthfulness after those operations is only partially asserted.

**Stale / mismatched coverage**

- This is the highest drift area in the current suite.
- Late-day scenarios can enter directly in `Adjust remainder`, so tests that assume route-mode entry first are stale-prone.
- Tests that assume the replan panel must close on cancel are stale against the current UI.

**Missing coverage**

- No explicit headed test that hard events remain visibly immovable in the preview itself.
- No explicit headed test that keep-essentials-only visibly drops lower-priority work before essential work.
- No explicit headed test that Oracle’s summary of a replan delta matches the actual preview delta.

**Proposed additions**

- Playwright:
  - Add a route-aware replan helper that explicitly supports both entry states:
    - route mode with `replan-trigger`
    - already-open `Adjust remainder`
  - Use it across all replan tests.
- Playwright:
  - Add a keep-essentials-only visible tradeoff test.
  - Stable surface: stayed-out list plus preview metrics, not transient summary prose.
- Playwright:
  - Add a hard-event immovability preview test using `Late-day replan stress test`.
  - Pass condition: the locked anchor remains present at the same visible time in route and preview-apply flows.
- Regression:
  - Continue to treat E1/E2/E3 invariants as deterministic-first checks.

**Confidence**

- `medium`

---

## M6 · Carry Forward Overflow Handling

**Goal**
Keep overflow honest across the current day, next-day intake, due warnings, and later replans without creating duplicate realities.

**Acceptance references**

- G1
- G2
- I1

**Covered well**

- Playwright:
  - `keeps same-day unplaced and carried-forward overflow in distinct buckets`
  - `keeps next-day carry-forward intake secondary and reviewable`
  - `review first stages exactly one carry-forward task into normal review`
  - `consumes accepted carry-forward intake exactly once in the UI`
  - `ignore for now keeps the item visible in ignored state`
  - `due warning stays visible across intake and route surfaces`
  - `cold reload restores a route with carry-forward-related state intact`
  - `replan does not duplicate carry-forward after intake acceptance`
  - `reload after intake actions keeps accepted and ignored carry-forward stable`
- Regression:
  - scheduled-late warning emission
  - carried-forward-late warning emission
  - split-task carry-forward remainder accounting
  - defer-vs-due overflow tradeoff
  - intake exact-once acceptance
  - accepted-then-edited carry-forward remains authoritative across build/replan/re-carry
  - legacy hydration of missing carry-forward fields
- Scenario dependencies:
  - `Overloaded liar-detector day`
  - `Next-day carry-forward intake test`

**Partially covered**

- Due-warning route assertions are currently durable, but still relatively shallow at the Oracle surface.
- Same-day unplaced vs carried-forward distinction is tested via seeded persisted state because the combined state is not naturally produced by the current scenario set.

**Stale / mismatched coverage**

- Route-layer due-warning tests drift if they assert exact Oracle prose instead of durable current-route indicators.
- Combined same-day-unplaced + carried-forward tests are inherently more fragile because they rely on seeded state mutation.

**Missing coverage**

- No headed test for accepted-then-edited carry-forward across replan and later carry-forward recurrence.
- No dedicated UI test that ignored carry-forward items keep their due-warning distinction after reload and later acceptance.

**Proposed additions**

- Playwright:
  - Add an accepted-then-edited carry-forward UI test using the next-day intake scenario.
  - Pass condition: edited accepted task remains the only authoritative task after build and replan.
- Playwright:
  - Add an ignored-then-later-accepted carry-forward test.
  - Stable surfaces: `carry-forward-intake`, `carry-forward-intake-ignored`, review card, and route state after build.
- Deterministic regression:
  - Keep exact-once, accepted-then-edited, and warning integrity here as the main truth layer.

**Confidence**

- `high`

---

## M7 · Real AI Interpretation And Scheduling Integration

**Goal**
Use real AI for interpretation, draft scheduling, and replanning without violating planner validation or degrading fallback behavior.

**Acceptance references**

- J1
- J2
- K1
- K2

**Covered well**

- Playwright:
  - `developer AI interpretation mode returns structured tasks and diagnostics`
  - `developer AI engine selections stay split by flow and survive reload`
  - `high-confidence AI interpretation uses refine strategy`
  - `low-confidence AI interpretation escalates to full strategy`
  - `slow AI interpretation preserves the AI result after waiting`
  - `Use local now applies the validated local draft fallback immediately`
  - `replan timeout preserves the current route and exposes a validated local preview`
  - `AI interpretation latency stays visible in the UI and diagnostics`
  - `AI draft build latency stays visible in the UI and diagnostics`
  - `AI replan latency stays inspectable while the remainder rebuilds`
  - `AI interpretation diagnostics stay inspectable with repair notes schema issues and payload previews`
  - `AI interpretation failures preserve editable setup and keep diagnostics visible`
  - `developer AI draft mode builds a validated route through the shared pipeline`
  - `AI draft rebuild sends the previous accepted proposal and task deltas after a small review edit`
  - `AI interpretation and draft diagnostics can coexist without clobbering each other`
  - `developer AI replan mode revises only the remainder and captures diagnostics`
  - `AI replan failures preserve the live route and keep the tool inspectable`
  - `AI draft failures preserve the reviewed task state and stay inspectable`
- Regression:
  - high-confidence refine path and low-confidence full path
  - AI parse translation and repair notes
  - hybrid AI draft payload contents
  - invalid AI draft output preserves the canonical route
  - draft summary stays out of route-honesty warnings
  - low-signal Oracle advice is filtered or replaced with route-aware notes
  - model-tier escalation helper logic
- Scenario dependencies:
  - `Ambiguous human-chaos input test`
  - `AI draft believability comparison`
  - `AI stale-route replan comparison`
  - `Normal realistic day`
  - `Late-day replan stress test`

**Partially covered**

- Model-tier escalation is covered deterministically but not clearly surfaced through headed developer diagnostics.
- AI quality expectations from `06-ai-behavior-spec-v2.md` are mostly represented through fallback/diagnostics tests rather than side-by-side quality assertions.

**Stale / mismatched coverage**

- AI tests drift when they assert Oracle prose instead of dedicated diagnostics panels.
- AI draft/replan tests that rely on old route-back controls or transient waiting prompts are stale-prone.

**Missing coverage**

- No headed test that developer diagnostics explicitly show the selected replan tier/escalation when the high-tier path is chosen.
- No headed side-by-side coverage for the AI comparison scenarios in the live catalog.
- No explicit test that `Keep waiting` remains available and correct for draft/replan the way interpretation has been hardened.

**Proposed additions**

- Playwright:
  - Add a developer diagnostics test for replan tier selection / escalation visibility.
  - Stable surface: diagnostics panel only.
- Playwright:
  - Add comparison tests for:
    - `AI draft believability comparison`
    - `AI stale-route replan comparison`
  - Pass condition: AI route/replan output is visible, validated, and diagnostics remain truthful.
- Regression:
  - Expand quality-focused assertions from `06-ai-behavior-spec-v2.md` into explicit deterministic checks where possible.

**Confidence**

- `medium`

---

## M7.5 · Oracle Glow Up

**Goal**
Make Oracle the interpretive execution surface for current, next, actions, and route-change clarity without becoming a noisy dashboard.

**Acceptance references**

- F1
- F2
- F3
- F4
- F5
- F6
- F7

**Covered well**

- Playwright:
  - `keeps the desktop route focused on timeline and immediate actions`
  - `keeps the visible timeline aligned with the next card`
  - `hides execution actions during a locked anchor`
  - `supports replan preview generate, cancel, and apply`
  - `due warning stays visible across intake and route surfaces`
- Regression:
  - current-time-state assertions
  - action availability for locked vs unlocked blocks
  - Oracle advice filtering and fallback note generation
- Scenario dependencies:
  - `Normal realistic day`
  - `Late-day replan stress test`
  - `Execution continuity test`

**Partially covered**

- F1 and F2 are covered well.
- F3 through F5 are only partially covered:
  - we verify some route operations and some diagnostics
  - we do not systematically verify that Oracle’s visible route summaries always match actual deltas
- F6 is partially covered through bounded-scroll and compact metrics expectations, but not through a dedicated “metrics hidden by default” test.

**Stale / mismatched coverage**

- This area has the most copy drift risk because Oracle wording is intentionally concise and iterates faster than route state.
- Tests should avoid exact summary prose unless the wording is itself the feature.

**Missing coverage**

- No explicit headed test for `no meaningful route change occurred` messaging.
- No explicit headed test that Oracle’s explanation of a revision matches preserved anchors, protected work, and deferred work.
- No explicit test that route metrics stay hidden until the user intentionally enters `Adjust remainder`.

**Proposed additions**

- Playwright:
  - Add a “no-change replan” test that verifies Oracle says the route is holding without manufacturing new insight.
  - Scenario: a late-day case where regenerated remainder is equivalent.
- Playwright:
  - Add a route-delta truthfulness test.
  - Stable surface: Oracle summary plus preview metrics / stayed-out list, not exact decorative copy.
- Playwright:
  - Add a default-vs-adjust-mode test proving deeper metrics are hidden until `Adjust remainder` is entered.

**Confidence**

- `medium`

---

## M8 · Route / List Companion View

**Goal**
Provide a same-day Route / List companion view over the same planner state without replacing the route as the primary surface.

**Acceptance references**

- H1
- H2
- H3

**Covered well**

- None.

**Partially covered**

- Carry-forward and same-day state are covered well in route mode, which will help later M8 work.

**Stale / mismatched coverage**

- None yet; the milestone is effectively unimplemented from a QA perspective.

**Missing coverage**

- Entire milestone is missing from Playwright and deterministic regression.
- No companion-view state parity checks exist.

**Proposed additions**

- Playwright:
  - Add route/list toggle parity tests once the feature exists.
  - Pass condition: placed work, unplaced work, fixed anchors, completed items, and carry-forward sections remain consistent between views.
- Deterministic regression:
  - Add a state-level parity helper only if the list view introduces non-trivial transformation logic.

**Confidence**

- `low`

---

## M9 · Polish And QA

**Goal**
Keep the planner visually legible, behaviorally stable, and aligned with the acceptance stack as the product evolves.

**Acceptance references**

- all milestone-order acceptance areas indirectly

**Covered well**

- Current verification stack:
  - `npm run lint`
  - `npm run build`
  - `npm run check:planner`
  - `npm run test:e2e:qa:headed`
- Playwright:
  - route stability on desktop/tablet
  - scroll-surface discipline
  - auto-focus restraint
  - shell/current-next readability
- Regression:
  - minute accounting
  - route validity
  - carry-forward integrity
  - AI fallback and validation integrity

**Partially covered**

- Visual polish is checked indirectly via structural UI tests, not through dedicated style or readability audits.
- Mobile and smaller-form-factor QA remains partial.

**Stale / mismatched coverage**

- `docs/README.md` still lags behind the v2 doc naming and currently under-describes the newer milestone structure.
- `08-seed-scenarios.md` is stale relative to the real dev scenario catalog in code.

**Missing coverage**

- No explicit audit test or docs check that the current scenario catalog matches the QA docs.
- No dedicated mobile QA sweep.
- No automated check that every acceptance area maps to at least one test or regression cluster.

**Proposed additions**

- Docs/scenario alignment:
  - Update `08-seed-scenarios.md` to match the current dev scenario catalog or clearly split “conceptual seed scenarios” from “current QA scenarios”.
- Docs/tooling:
  - Add a lightweight audit maintenance note requiring new planner features to update:
    - acceptance mapping
    - scenario coverage
    - Playwright or regression coverage
- Playwright:
  - Add one mobile-oriented smoke lane for the planner route and setup shells.

**Confidence**

- `medium`

---

## Current Playwright Test Mapping

This is the primary milestone assignment for every current Playwright test.

### M1 / M1 refinement

- `keeps the desktop route focused on timeline and immediate actions`
- `keeps the visible timeline aligned with the next card`
- `keeps the granular short-task route stable on desktop and tablet`
- `uses the timeline as the only bounded scroll surface in route mode`
- `keeps timeline auto-focus restrained`

### M2

- `keeps the partial-time interpretation flow interactive`
- `keeps draft form state stable across rerender-like interactions`
- `keeps anchor presence truthful while anchor rows exist`
- `supports keyboard-first setup and interpretation controls`
- `surfaces planning-window and incomplete-fixed-event validation`

### M3

- `supports spread-out pace mode with visible open time buffers`
- `does not duplicate locked anchor labels in the timeline`
- `shows honest overflow for overloaded days`

### M4

- `preserves reviewed task edits across build back and rebuild`
- `hides execution actions during a locked anchor`
- `keeps route actions and replan controls keyboard reachable`
- `keeps execution state coherent across completion and reload`
- `hydrates persisted route state on a cold page load`

### M5

- `supports replan preview generate, cancel, and apply`
- `supports every replan mode and persists an applied replan across reload`
- `keeps replan preview accounting internally consistent`
- `replan from now keeps missed work visible in the remainder`
- `resets replan mode to the base option on rebuild`

### M6

- `keeps same-day unplaced and carried-forward overflow in distinct buckets`
- `keeps next-day carry-forward intake secondary and reviewable`
- `review first stages exactly one carry-forward task into normal review`
- `consumes accepted carry-forward intake exactly once in the UI`
- `ignore for now keeps the item visible in ignored state`
- `due warning stays visible across intake and route surfaces`
- `cold reload restores a route with carry-forward-related state intact`
- `replan does not duplicate carry-forward after intake acceptance`
- `reload after intake actions keeps accepted and ignored carry-forward stable`

### M7

- `developer AI interpretation mode returns structured tasks and diagnostics`
- `developer AI engine selections stay split by flow and survive reload`
- `high-confidence AI interpretation uses refine strategy`
- `low-confidence AI interpretation escalates to full strategy`
- `slow AI interpretation preserves the AI result after waiting`
- `Use local now applies the validated local draft fallback immediately`
- `replan timeout preserves the current route and exposes a validated local preview`
- `AI interpretation latency stays visible in the UI and diagnostics`
- `AI draft build latency stays visible in the UI and diagnostics`
- `AI replan latency stays inspectable while the remainder rebuilds`
- `AI interpretation diagnostics stay inspectable with repair notes schema issues and payload previews`
- `AI interpretation failures preserve editable setup and keep diagnostics visible`
- `developer AI draft mode builds a validated route through the shared pipeline`
- `AI draft rebuild sends the previous accepted proposal and task deltas after a small review edit`
- `AI interpretation and draft diagnostics can coexist without clobbering each other`
- `developer AI replan mode revises only the remainder and captures diagnostics`
- `AI replan failures preserve the live route and keep the tool inspectable`
- `AI draft failures preserve the reviewed task state and stay inspectable`

### M7.5

- `supports replan preview generate, cancel, and apply`
- `due warning stays visible across intake and route surfaces`

### M8

- None yet.

### M9

- `keeps the desktop route focused on timeline and immediate actions`
- `keeps the granular short-task route stable on desktop and tablet`
- `uses the timeline as the only bounded scroll surface in route mode`
- `keeps timeline auto-focus restrained`

---

## Deterministic Regression Mapping

These are the main regression clusters, grouped by milestone rather than by every individual assert.

### M2

- due/time shorthand parsing
- accepted due/time edit preservation through build-back-interpret
- legacy hydration of missing setup-era planner fields

### M3

- generated-route validity
- task-minute accounting
- spread-out pace behavior
- productive-break classification constraints
- overload honesty and due-protection tradeoffs

### M4

- current-time state derivation
- skip / complete / delay continuity
- completed history preservation
- locked-anchor action rejection
- reload hydration of current route state

### M5

- replan validity
- preserved-history invariants
- late-day replan stayed-out accounting
- missed past work recaptured into the remainder
- replan pace preservation

### M6

- scheduled-late warnings
- carried-forward-late warnings
- split-task carry-forward remainder accounting
- defer-vs-due overflow choice
- next-day intake exact-once behavior
- accepted-then-edited carry-forward authority across build/replan/re-carry
- hydration of missing carry-forward state

### M7

- parse refine vs full confidence gate
- AI parse translation / repair notes
- AI draft payload shaping
- invalid AI draft rejection preserving canonical route
- AI draft/oracle summary filtering
- replan tier escalation helper behavior

---

## Milestone-Sorted Implementation Backlog

Sort execution in this order:

1. stale test modernization blocking the gate
2. uncovered acceptance gaps
3. regression gaps better suited to deterministic checks
4. docs/scenario alignment
5. lower-risk polish

### Gate blockers and stale modernization

1. Target layer: Playwright
   Behavior: replan helpers must support both route-mode entry and already-open `Adjust remainder` entry.
   Stable surface: `replan-trigger`, `Adjust remainder`, `Generate revised plan`, `Apply revised plan`.
   Preferred scenario: `Late-day replan stress test`.
   Pass condition: all replan entry tests pass without assuming one initial Oracle state.
   Anti-pattern: assuming cancel always closes the replan panel.

2. Target layer: Playwright
   Behavior: carry-forward late warnings should be asserted from durable route/intake surfaces.
   Stable surface: intake cards, `oracle-panel`, current-route identity, dedicated diagnostics when relevant.
   Preferred scenario: `Next-day carry-forward intake test`.
   Pass condition: warning visibility is proven without matching fragile Oracle prose.
   Anti-pattern: exact banner-copy assertions in route mode.

3. Target layer: Playwright
   Behavior: AI diagnostics assertions must use dedicated diagnostics panels, not Oracle summaries.
   Stable surface: `planner-ai-diagnostics` panel sections.
   Preferred scenario: `Normal realistic day`, AI comparison scenarios.
   Pass condition: diagnostics remain truthful across success, timeout, fallback, and failure paths.
   Anti-pattern: asserting AI summary text from `oracle-panel`.

### Acceptance gaps with no strong current coverage

4. Target layer: Playwright
   Behavior: minimal A1 paste-to-interpret smoke path.
   Stable surface: brain-dump editor, `Interpret tasks`, review heading.
   Preferred scenario: blank day or a tiny new scenario.
   Pass condition: raw multiline input can always reach interpretation.
   Anti-pattern: relying on developer tools scenario loading for this basic flow.

5. Target layer: Playwright
   Behavior: visible hard-event immovability during local route generation and replan preview.
   Stable surface: timeline blocks, locked-anchor labels, preview/apply flows.
   Preferred scenario: `Late-day replan stress test` or a smaller anchor-heavy scenario.
   Pass condition: anchor time/location remains unchanged through build and replan.
   Anti-pattern: validating only through hidden state.

6. Target layer: Playwright
   Behavior: productive-break routing excludes deep work and preserves at least one real break.
   Stable surface: timeline block titles and break blocks.
   Preferred scenario: `Low-energy productive-break test`.
   Pass condition: deep-work tasks do not appear inside productive break windows.
   Anti-pattern: asserting only total block counts.

7. Target layer: Playwright
   Behavior: Oracle no-change messaging and route-delta truthfulness.
   Stable surface: `oracle-panel`, preview metrics, stayed-out list.
   Preferred scenario: `Late-day replan stress test`.
   Pass condition: Oracle explains real planner deltas and says plainly when nothing changed.
   Anti-pattern: snapshotting decorative prose wholesale.

8. Target layer: Playwright
   Behavior: accepted-then-edited carry-forward remains authoritative after build and replan.
   Stable surface: carry-forward intake cards, review cards, route state after build, later carry-forward remainder if present.
   Preferred scenario: `Next-day carry-forward intake test`.
   Pass condition: stale original carry-forward ids never reappear as authoritative work.
   Anti-pattern: checking only title duplication without checking task identity continuity.

9. Target layer: Playwright
   Behavior: AI comparison scenarios are actually exercised in headed coverage.
   Stable surface: route state plus diagnostics panels.
   Preferred scenarios:
   - `AI draft believability comparison`
   - `AI stale-route replan comparison`
   Pass condition: AI route/replan behavior is visible, validated, and inspectable.
   Anti-pattern: covering these only through local mocks on `Normal realistic day`.

### Regression gaps better suited to deterministic checks

10. Target layer: deterministic regression
    Behavior: AI quality expectations from `06-ai-behavior-spec-v2.md` should be codified beyond latency/fallback.
    Stable state source: parse results, translated AI draft/replan payloads, validated route state.
    Pass condition: splittability, break-eligibility, deferrability, energy, and must-do inferences remain plausible under representative inputs.
    Anti-pattern: trying to enforce subjective wording through headed UI only.

11. Target layer: deterministic regression
    Behavior: route/list parity for future M8 work, once the feature exists.
    Stable state source: shared planner state feeding both views.
    Pass condition: list sections match route state exactly.
    Anti-pattern: introducing UI parity tests before a stable list-view model exists.

### Docs and scenario alignment

12. Target layer: docs/scenario alignment
    Behavior: `08-seed-scenarios.md` should reflect the real dev scenario catalog or explicitly say it is conceptual-only.
    Stable source: `src/app/_lib/planner/dev-scenarios.ts`.
    Pass condition: scenario docs and test expectations no longer drift silently.
    Anti-pattern: leaving old generic scenario docs to masquerade as current QA truth.

13. Target layer: docs/scenario alignment
    Behavior: docs index should expose the milestone coverage audit as a maintained artifact.
    Stable source: `docs/README.md`.
    Pass condition: engineers can find the audit from the docs index without guessing.
    Anti-pattern: adding a new audit doc without indexing it.

### Lower-risk polish coverage

14. Target layer: Playwright
    Behavior: mobile planner smoke coverage for setup and route shells.
    Stable surface: layout-level visibility, timeline readability, Oracle visibility or intentional collapse behavior.
    Preferred scenario: `Normal realistic day`.
    Pass condition: planner remains usable at small widths.
    Anti-pattern: brittle pixel assertions.

15. Target layer: docs/tooling
    Behavior: new planner features should require acceptance mapping + coverage updates.
    Stable source: this audit plus the build sequence.
    Pass condition: future milestone additions update tests and docs together.
    Anti-pattern: allowing feature work to land with no acceptance/coverage delta.

---

## Recommended Execution Order

1. Finish stale replan and Oracle modernization that still blocks the suite.
2. Fill the acceptance gaps in M2, M3, M5, M6, and M7.5.
3. Add AI comparison coverage and diagnostics hardening in M7.
4. Update scenario/docs alignment so the audit remains truthful.
5. Add mobile and polish coverage under M9.
