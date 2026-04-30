# Waykeeper Web

Waykeeper is a one-day, timeline-first planner built with Next.js.

## Local development

Use the explicit local scripts so manual review and automation do not fight over the same port.

### Manual review
Run your own local app on `3000`:

```bash
npm run dev:user
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000) in your browser.

### Automation / QA
Playwright and Codex automation reserve `3100`:

```bash
npm run qa:server
```

For production-style local checks:

```bash
npm run build
npm run start:user
```

or:

```bash
npm run build
npm run start:qa
```

## Parallel local workflow

Port contract:
- manual browser review: `3000`
- Playwright / Codex automation: `3100`
- extra parallel worktrees or experimental runs: `3110+`

Workflow rules:
- a single working tree can only run one `next dev` server at a time in this setup
- use the same working tree and shared `3000` server when two viewers need the exact same live files
- use `qa:server` on `3100` when automation should run in parallel without stealing the manual review port
- use separate git worktrees when multiple threads need to edit code in parallel
- separate worktrees do not live-sync with each other; they only match after changes are merged, rebased, or cherry-picked
- automated QA should not borrow whatever manual server happens to be open

## Playwright

`npm run test:e2e` now targets the automation lane by default and uses:
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100` by default
- an auto-started local QA server on `3100` built from the current tree unless one is already running on that automation port

If you need Playwright to hit your already-running live dev server on `3000`, use shared mode:

```bash
npm run test:e2e:shared
```

You can override the target explicitly if needed:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3110 npm run test:e2e
```

## Troubleshooting

If Playwright or the Codex browser tool fails with `Opening in existing browser session`, clear the Playwright Chrome profile cache:

```bash
rm -rf ~/Library/Caches/ms-playwright/mcp-chrome
```

If exact live parity matters, share one working tree and point both viewers or tests at the same running dev server. Two independently mutating worktrees cannot both stay live-up-to-date at the same time.
