# Waykeeper Submission Copy

## Core fields

Title:
Waykeeper

Tagline:
Paste the day's mess in. Get back a livable route through it.

Short description:
Waykeeper turns a messy same-day task dump into a realistic route, then helps you stay oriented as the day changes.

Longer description:
Waykeeper is a one-day planning tool for people whose days do not fit neatly into a calendar. Paste a chaotic task list, add real constraints, and Waykeeper turns it into a readable route with focus blocks, breaks, deferred tasks, and a calm Oracle side panel for what matters now and what should happen next.

AI usage:
AI helps interpret messy task input, draft or refine a believable schedule, and explain route changes. The app keeps a validated local route usable first, and AI refinements are explicit rather than silently replacing the visible plan.

Demo instructions:
Try the Working Professional sample day, then open the route. Look at the active countdown, Oracle notes, and Share route daily brief. Then try Start today's plan to see the real intake flow.

## Screenshot set

1. `docs/submission/screenshots/01-welcome-hero.png`
2. `docs/submission/screenshots/02-how-it-works-modal.png`
3. `docs/submission/screenshots/03-sample-persona-preview.png`
4. `docs/submission/screenshots/04-route-light-countdown-oracle.png`
5. `docs/submission/screenshots/05-share-route-daily-brief.png`
6. `docs/submission/screenshots/06-route-dark-optional.png`

## Final local QA notes

- Normal submission UX opens on the welcome screen.
- Developer tools are hidden unless `NEXT_PUBLIC_WAYKEEPER_SHOW_DEV_TOOLS=1` is set.
- `How it works` opens the explanation modal.
- Working Professional sample preview builds into the matching concrete route.
- Active route blocks show the countdown timer.
- Share route defaults to the daily brief and keeps LLM-ready/raw variants available.
- Light mode is the default route theme; dark mode remains available.
- Fresh `Start today's plan` reaches the guided intake/profile flow.
