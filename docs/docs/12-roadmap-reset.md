# 12 · Roadmap Reset

## Summary
Core v1 planner loop is functionally real; remaining work is interaction maturity and latency discipline.

Waykeeper already has the important product spine:
- messy intake to structured day setup
- route generation
- current / next execution
- explicit replan
- carry-forward honesty
- persistence
- real AI parse / draft / replan integration
- Oracle as an interpretive side surface

The main risk is no longer missing core capability. It is that AI latency and unresolved interaction-trust issues can make the product feel less reliable than it actually is. The roadmap should therefore prioritize execution trust, latency discipline, and Oracle-centered refinement before expanding into secondary surfaces.

## Current Product Read
Waykeeper should now be treated as a real one-day planner, not a prototype.

What it already does well:
- turns a same-day brain dump into a believable route
- keeps the timeline as the primary execution surface
- supports explicit revision instead of silent replanning
- separates planner truth from Oracle interpretation
- preserves the app-owned source of truth even when AI is involved

What still needs maturity:
- execution calm inside the route itself
- trust in delay / skip / replan behavior over repeated use
- AI responsiveness and non-slippery refinement behavior
- full Oracle consolidation
- only later, a Route / List companion once route behavior feels settled

## Product Contracts To Lock
### 1. AI arrival contract
- a validated local route or local replan preview becomes usable first when available
- AI runs as a second-pass refinement lane
- if AI finds a materially better validated option, Oracle presents it as a concise compare / apply offer
- AI never silently replaces the visible route

### 2. Replan contract
- replan changes only the unfinished remainder
- completed history and current boundary stay legible and preserved
- if no meaningful improvement occurred, Waykeeper should say so plainly

### 3. Oracle contract
- Oracle is the interpretive side surface for:
  - current / next understanding
  - route change summaries
  - late AI improvement offers
  - explicit remainder tuning
- Oracle must not become a chatty assistant or a second planner

### 4. Route / List gating contract
- Route / List is not next no matter what
- it becomes the next major surface only after route interaction feels behaviorally settled:
  - strong execution trust
  - calm block interaction
  - legible replan outcomes
  - current / next rhythm that feels instinctive

## Execution Trust Requirements
Waykeeper needs to feel reliable across repeated days, not just produce impressive first drafts.

Required trust rules:
- no surprising route mutations
- delay preserves understandable causality
- skip never creates hidden planner logic
- carry-forward feels psychologically fair, not like punishment
- every route change remains legible in hindsight
- block completion, delay, skip, and replan should strengthen the user’s mental model rather than obscure it

Acceptance focus:
- after any route change, the user can still explain why the day now looks the way it does
- Oracle summaries match actual planner deltas
- skipped or deferred work does not visually corrupt trust
- repeated use makes the planner feel more dependable, not more mysterious

## Roadmap Direction
### Priority 1. Latency discipline
- local-first route and local-first replan should be the default product experience
- AI should refine, not gate
- the strongest slower model should not remain the ordinary default for common flows
- delta-aware reuse should be preferred whenever only small edits changed

### Priority 2. Interaction maturity
Stabilize the route itself before adding more surface area.

Focus here:
- current / next rhythm
- calm execution actions
- replan clarity
- visual trust in block state transitions
- Oracle consolidation around live planning behavior

### Priority 3. Oracle-centered refinement
Use Oracle to present late AI improvements and planner meaning.

Examples:
- concise “upon further review” improvement offer
- compare / apply, not auto-replace
- explicit “no meaningful improvement” behavior when appropriate

### Priority 4. Route / List only after the route is settled
Route / List remains a strong later move, but only once the primary route mode feels instinctive and trustworthy.

## Planner Temperament Guardrails
Preserve planner temperament:
- calm
- exact
- non-performative
- no fake encouragement
- no AI theatrics
- no tone inflation
- no “smart assistant” self-display

The product should feel like:
- a precise, humane planner
- not a productivity mascot
- not an eager AI companion
- not motivational software

## Test And Review Focus
- local draft appears before any AI refinement is needed
- local replan preview appears before any AI refinement is needed
- AI late arrival never silently mutates the route
- Oracle presents AI improvements as explicit compare / apply offers
- delay, skip, complete, and replan remain legible in hindsight
- carry-forward remains honest and fair
- route interaction feels calm and repeatable before Route / List ships

## Assumptions And Defaults
- Waykeeper remains a one-day planner first
- the correct near-term strategy is faster product behavior, not more blocking AI intelligence
- Route / List is conditional on route interaction maturity, not automatically the next milestone
- the product’s strongest differentiator is the combination of:
  - believable route logic
  - explicit replanning
  - calm Oracle interpretation
  - non-theatrical planner temperament
