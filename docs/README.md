# Waykeeper

Waykeeper is an AI-assisted daily planner that turns a messy to-do list into a realistic day timeline with adaptive focus blocks, intelligent breaks, and user-triggered replanning when the day slips.

This repository handoff pack is meant to give Codex a concrete product, UX, and implementation target before writing code.

## Documents

- [01-product-overview.md](docs/01-product-overview.md)
- [02-prd.md](docs/02-prd.md)
- [03-ux-spec.md](docs/03-ux-spec.md)
- [04-data-schema.md](docs/04-data-schema.md)
- [05-scheduling-rules.md](docs/05-scheduling-rules.md)
- [06-ai-behavior-spec.md](docs/06-ai-behavior-spec.md)
- [07-design-system.md](docs/07-design-system.md)
- [08-seed-scenarios.md](docs/08-seed-scenarios.md)
- [09-acceptance-tests.md](docs/09-acceptance-tests.md)

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
2. Intake flow + pasted task parsing UI
3. Structured task model + local planner state
4. Schedule generation logic
5. Timeline rendering and manual editing
6. Replan-from-now flow
7. AI integration
8. Design polish and refinement

## Working name

**Waykeeper**

Core product idea: it keeps a livable path through the day.
