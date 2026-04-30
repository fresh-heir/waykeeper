# Waykeeper

Waykeeper is an AI-assisted daily planner that turns a messy to-do list into a realistic day timeline with adaptive focus blocks, intelligent breaks, and user-triggered replanning when the day slips.

This repository handoff pack is meant to give Codex a concrete product, UX, and implementation target before writing code.

## Documents

- Active redesign workspace:
  [13-submission-redesign-workspace.md](docs/13-submission-redesign-workspace.md)

- [01-product-overview.md](docs/01-product-overview.md)
- [02-prd-v2.md](docs/02-prd-v2.md)
- [03-ux-spec-v2.md](docs/03-ux-spec-v2.md)
- [04-data-schema-v2.md](docs/04-data-schema-v2.md)
- [05-scheduling-rules-v2.md](docs/05-scheduling-rules-v2.md)
- [06-ai-behavior-spec-v2.md](docs/06-ai-behavior-spec-v2.md)
- [07-design-system.md](docs/07-design-system.md)
- [08-seed-scenarios.md](docs/08-seed-scenarios.md)
- [09-acceptance-tests.md](docs/09-acceptance-tests.md)
- [10-codex-build-sequence.md](docs/10-codex-build-sequence.md)
- [11-planner-coverage-audit.md](docs/11-planner-coverage-audit.md)
- [12-roadmap-reset.md](docs/12-roadmap-reset.md)
- [13-submission-redesign-workspace.md](docs/13-submission-redesign-workspace.md)

## Product summary

Waykeeper is a separate product from Time Sanctuary.

- **Waykeeper** decides what the day should look like.
- **Time Sanctuary** protects execution once the user knows what they should be doing.

Waykeeper is not a full project-management platform in v1. It is a one-day planner with a timeline-first interface.

## Proposed v1 stack

- Web-first app
- TypeScript
- React / Next.js
- Local persistence first
- Backend route for OpenAI calls
- OpenAI Responses API for parsing, schedule drafting, and replanning

## Suggested implementation milestones

1. App shell + routing + timeline scaffold
2. Layout correction + shell refinement
3. Day setup / intake flow
4. Interpretation placeholder + local route generation
5. Current / next awareness + execution interactions
6. Replan-from-now flow
7. Carry Forward overflow
8. Real AI integration
9. Design polish and QA

## Working name

**Waykeeper**

Core product idea: it keeps a livable path through the day.
