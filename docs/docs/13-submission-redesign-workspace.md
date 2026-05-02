# 13 · Submission Redesign Workspace

This is the active working document for the Handshake/OpenAI Codex Creator Challenge submission push.
It is meant to stay live, iterative, and current through the April 30, 2026 submission push and final post-submission polish.

Use this file as the single workspace for:
- current redesign direction
- locked product and design decisions
- progress tracking
- next actions
- short factual history of what changed

## Mission and submission context

Waykeeper is being repositioned for a challenge-facing submission that should feel like a real, polished daily-life planning product rather than an internal prototype.

Working mission for this phase:
- make the product visually compelling, distinctive, and memorable
- keep it calm, useful, and product-first
- strengthen first impression without losing the existing planner trust model
- create a submission-ready story for judges, employers, and alpha viewers

Deadline context:
- target submission: Handshake/OpenAI Codex Creator Challenge
- target date: April 30, 2026

Working rules for this document:
- log every meaningful product or design decision in `Decision log`
- log every completed milestone or substantive subtask in `What we've done`
- keep `Next up` limited to the immediate next action or tiny cluster of actions
- keep `Change log` short, dated, and factual
- let the active daily heartbeat automation reconcile this file when material progress makes it stale

## Current state snapshot

Product read as of 2026-05-01:
- the planner spine is already real: intake, interpretation/review, route generation, Oracle, replan, carry-forward, persistence, and AI refinement all exist in the current app
- the main risk has shifted from missing planner capability to screen-level visual QA, polish, and challenge-facing flow confidence
- a `welcome_resume` entry layer now exists before the planner, with start, resume, and sample-day paths
- developer/debug surfaces are hidden from the default submission UX and can be restored with `NEXT_PUBLIC_WAYKEEPER_SHOW_DEV_TOOLS=1`
- the accepted desktop concept board is now the near-1:1 submission target:
  editorial fantasy product shell, generated set-piece art, left navigation, guided intake/profile flow, route waypoint list, and strong Oracle rail
- the production pass now uses a hybrid asset strategy:
  generated raster set pieces for welcome, sample-day preview, loading card, and app-symbol showcase; SVG/CSS primitives for marks, glyphs, waymarks, and UI accents
- the first full UI/UX redesign pass is implemented across welcome/resume, sample-day preview, setup/intake, route + Oracle, loading card, app symbol showcase, local profile fields, and global shell styling
- a focused submission polish pass is now implemented:
  light mode is the default planner surface, dark mode is available through a persisted toggle, the welcome hero uses the enlarged brand/date lockup, `How it works` opens a modal, and sample day now offers broad persona choices
- the next risk is final visual QA and deployment readiness:
  tightening route light-mode polish, checking generated asset scale/load size, and preparing the final challenge submission copy
- near-deadline autopilot pass is now focused on practical specificity:
  concrete sample days, useful local profile metadata, product-facing share/export output, and final demo confidence
- browser e2e QA is no longer blocked under full filesystem access:
  Chromium launches, the redesigned shell compatibility pass is complete, and the full non-real-AI QA suite is green
- final packaging pass is now submission-ready locally:
  production build uses the documented Webpack build path for stable `next start`, final screenshots are captured under `docs/submission/screenshots/`, and submission copy is written at `docs/submission/submission-copy.md`
- GitHub and production deployment are now connected:
  the repo is pushed to `https://github.com/fresh-heir/waykeeper`, and the production app is live at `https://waykeeper.vercel.app`
- post-submission polish added persistent multi-plan drafts, live timezone-sensitive welcome/date settings, nested fixed-anchor handling, vertical profile art, contained route sidebar navigation, and a fixed viewport bottom navigation
- active countdown now starts filled from 0 to the block duration, then drains clockwise toward 0, with label collision removed
- soft time-based scheduling heuristics now infer obvious meals, day parts, business-hour tasks, prep-before-target ordering, laundry sequencing, and grocery-before-cooking flow without overriding explicit anchors or user locks
- this workspace is no longer the daily execution tracker for submission; future work should move into a post-submission polish tracker or GitHub issues

Current verification read:
- `npm run lint` passed on 2026-04-22
- `npm run check:planner` passed on 2026-04-22
- `npm run build` passed on 2026-04-22
- `npm run lint` passed on 2026-04-23
- `npm run check:planner` passed on 2026-04-23
- `npm run build` passed on 2026-04-23
- `npm run lint` passed on 2026-04-25
- `npm run check:planner` passed on 2026-04-25
- `npm run build` passed on 2026-04-25
- `npm run lint` passed on 2026-04-26
- `npm run check:planner` passed on 2026-04-26
- `npm run build` passed on 2026-04-26
- `npm run lint` passed on 2026-04-27
- `npm run check:planner` passed on 2026-04-27
- `npm run build` passed on 2026-04-27
- `npx playwright test tests/e2e/planner.spec.ts tests/e2e/submission-polish.spec.ts --list` passed on 2026-04-27
- `npm run lint` passed on 2026-04-28
- `npm run check:planner` passed on 2026-04-28
- `npm run build` passed on 2026-04-28
- `npm run test:e2e:qa` passed on 2026-04-28:
  70 passed, 3 real-AI smoke tests intentionally skipped
- `npm run lint` passed on 2026-04-29
- `npm run check:planner` passed on 2026-04-29
- `npm run build` passed on 2026-04-29 using `next build --webpack`
- `npm run test:e2e:qa` passed on 2026-04-29:
  71 passed, 3 real-AI smoke tests intentionally skipped
- manual production smoke passed on 2026-04-29:
  normal welcome first, dev tools hidden, How It Works modal opens, Working Professional sample builds, active countdown appears, Share route variants are present, Light/Dark toggle works, and Start today's plan reaches guided intake
- `npm run lint` passed on 2026-05-01 after the floating route nav and countdown-fill patch
- `npm run check:planner` passed on 2026-05-01 after the time-affinity scheduling patch
- `npm run lint` passed on 2026-05-01 after the time-affinity scheduling patch
- `npm run build` passed on 2026-05-01 after the time-affinity scheduling patch

Workspace upkeep:
- daily thread-heartbeat automation created on 2026-04-22
- default cadence: 10:00 AM America/Anchorage
- update rule: only edit this workspace when there is material progress, a changed decision, stale status content, or missing change-log coverage
- retired on 2026-05-01 after the April 30 submission phase and production deployment were complete

## North star for this phase

Waykeeper should feel like:
- a polished daily-life tool first
- atmospheric and premium
- exact, calm, and trustworthy
- unique enough to be memorable

Waykeeper should not feel like:
- a game UI
- faux-medieval cosplay
- generic startup SaaS
- a chatty AI assistant
- a collection of debug panels

Core product stance for this redesign:
- route remains the primary surface
- Oracle remains the interpretive side surface
- AI refines but does not silently rewrite the visible route
- first-run experience should support start, resume, and a clearly labeled sample day path

## Phase roadmap

| Track | Status | Goal | Exit condition |
| --- | --- | --- | --- |
| Workspace setup | Done | Create the active redesign workspace, index it in docs, and attach upkeep automation. | This file exists, docs index points here, and the heartbeat automation is active. |
| Phase 0 · Moodboard workspace | Done | Collect hybrid inputs, synthesize visual direction, and lock one art direction. | Moodboard inputs are filled, visual synthesis is documented, and one direction is chosen for implementation. |
| Phase 1 · First-run and product framing | Done | Redesign welcome/resume flow, sample-day experience, and remove debug-first impression. | Cold start direction is implemented and challenge-facing first impression is product-first. |
| Phase 2 · Core aesthetic revamp | Done | Apply the chosen visual system to setup, route, timeline, and Oracle. | The main planner surfaces share one coherent aesthetic and hierarchy system. |
| Phase 3 · Submission readiness | Done | Tighten desktop QA, mobile safety, demo honesty, and challenge-facing presentation. | Production URL, GitHub remote, screenshots/copy, launch helpers, and final smoke notes are in place. |

## Decision log

- 2026-04-22: This file is the active source of truth for the submission redesign workspace.
- 2026-04-22: Submission target is the Handshake/OpenAI Codex Creator Challenge with an April 30, 2026 deadline.
- 2026-04-22: The redesign should optimize for a polished daily-life tool first, not an AI-systems showcase first.
- 2026-04-22: The product direction is broader redesign, not minor polish only.
- 2026-04-22: Near-term audience is challenge judges/employers and alpha viewers, not just internal dogfooding.
- 2026-04-22: Visual direction should become more atmospheric and distinctive, while staying explicitly not game-like and not overdone.
- 2026-04-22: First-run should prioritize a welcome/resume flow rather than dropping straight into setup.
- 2026-04-22: Cold start should include a clearly labeled sample-day preview path for demoability.
- 2026-04-22: Developer/debug surfaces should be hidden from the primary submission UX by default.
- 2026-04-22: Moodboard workflow is hybrid: user supplies vibe words, anti-vibes, and optional references; synthesis happens in this workspace.
- 2026-04-22: This workspace uses one combined doc with plan, decision log, progress tracking, next actions, and change log rather than split documents.
- 2026-04-22: A daily thread-heartbeat automation maintains this workspace and should update it only when material progress or stale status requires it.
- 2026-04-22: Heartbeat cadence defaults to 10:00 AM America/Anchorage.
- 2026-04-22: Route/List, standalone settings, and a separate full focus mode remain deferred until after submission unless priorities change materially.
- 2026-04-22: Of the first three concept directions, `Celestial Arcade` resonated most strongly with the user.
- 2026-04-22: `Celestial Arcade` should be refined toward more nature and less orange, keeping ceremonial framing but shifting toward cooler botanical radiance.
- 2026-04-22: The first refined UI concept pass was still too controlled, not expressionistic enough, and not boldly colorful enough compared with the reference images.
- 2026-04-22: The next concept round should push much harder toward painterly composition, bolder saturation, deeper chromatic contrast, and more emotional visual force while remaining product-legible.
- 2026-04-22: Of the expressionist concept round, the first concept branch resonated most.
- 2026-04-22: The next refinement should replace moon motifs with star motifs and broaden the palette across gemstone hues instead of leaning mostly purple.
- 2026-04-23: The implementation direction should move away from horoscope-like celestial atmosphere and toward an editorial Scandinavian product system with flat bright fantasy SVG accents.
- 2026-04-23: Fantasy should act as a graphic accent language, not as the default product container.
- 2026-04-23: Full illustrative or atmospheric backgrounds should be reserved for intentional set pieces rather than core planner screens.
- 2026-04-23: Accepted production direction is an editorial Scandinavian desktop shell with gemstone-hue accents from the reference images, not a purple-only celestial palette.
- 2026-04-23: Oracle uses the sparkle-star as its signature mark.
- 2026-04-23: The Waykeeper loading card and app symbol should be SVG-first, derived from the arched window, open book, and star motif.
- 2026-04-23: The `Let's get to know your day` idea is today-first onboarding that reuses existing planner inputs, not a persistent profile system.
- 2026-04-23: `Try sample day` should route through existing planner scenario logic rather than a static fake screen.
- 2026-04-23: Developer/debug surfaces should remain available for tests and local diagnostics only through `NEXT_PUBLIC_WAYKEEPER_SHOW_DEV_TOOLS=1`.
- 2026-04-23: Playwright QA should set `NEXT_PUBLIC_WAYKEEPER_SKIP_WELCOME=1` so existing planner tests keep exercising planner surfaces directly.
- 2026-04-23: Browser QA is currently environment-blocked in Codex by Chrome / Chromium process launch crashes, not by an observed Waykeeper runtime failure.
- 2026-04-25: The SVG-first brand mark is still useful for icons and small UI motifs, but the welcome/loading hero art should likely shift to generated raster/set-piece assets for submission speed and visual quality.
- 2026-04-25: The open-book motif must read clearly at both hero-card and app-icon sizes; abstract dome-only geometry is not enough.
- 2026-04-25: The attached concept board is the near-1:1 desktop submission target for the full UI/UX redesign.
- 2026-04-25: Production now uses generated raster assets for large set pieces and SVG/CSS for reusable UI marks and accents.
- 2026-04-25: Stable generated asset paths are locked:
  `/waykeeper/welcome-hero.png`, `/waykeeper/sample-day-hero.png`, `/waykeeper/loading-card.png`, and `/waykeeper/app-symbol-showcase.png`.
- 2026-04-25: The local profile layer is intentionally lightweight:
  name, journey, priorities, rhythm, and preference persist with the planner session but do not feed scheduling logic yet.
- 2026-04-25: Route mode now uses the waypoint-list composition from the concept board:
  left navigation shell, center route list with time rail, and right Oracle rail.
- 2026-04-25: The dense timeline is no longer the primary route UI, but compatibility test IDs remain on the new waypoint list where practical.
- 2026-04-25: `Reflections`, `Library`, and `Settings` are visible as disabled/stub navigation affordances for submission, not active features.
- 2026-04-25: `Try sample day` first shows a concept preview, then loads a real scenario through the existing scenario/planner path.
- 2026-04-26: Light mode is the default route + Oracle submission surface; dark mode remains available through a visible local-only toggle.
- 2026-04-26: The welcome screen should use the Waykeeper mark + date lockup as the hero title treatment instead of a duplicate oversized headline.
- 2026-04-26: The welcome hero metrics strip is replaced by the tagline `Your day, shaped into a route you can trust.`
- 2026-04-26: `How it works` is now a functional modal explaining `Tell us your day`, `Review the interpretation`, and `Follow your route with Oracle`.
- 2026-04-26: Sample day is now persona-based with `Student`, `Working Professional`, and `Creative / Founder` paths.
- 2026-04-26: New sample scenario IDs are locked:
  `sample-student-day`, `sample-working-professional-day`, and `sample-creative-founder-day`.
- 2026-04-26: Generated transparent welcome sparkle overlay path is locked:
  `/waykeeper/welcome-star-overlay.png`.
- 2026-04-27: Daily brief is now the primary route output format because it is most legible for demos, judges, and real users.
- 2026-04-27: Route export is renamed in the UI to `Share route`, while preserving route export test IDs for compatibility.
- 2026-04-27: `llm_ready` and `raw_text` remain available as secondary share variants for AI handoff and mechanical/debug-adjacent schedule review.
- 2026-04-27: Sample personas must use concrete recognizable work:
  student, working professional, and creative/founder previews should match the scenario that actually builds.
- 2026-04-27: Profile fields may shape visible copy, profile summary, and share brief metadata, but they should not silently alter deterministic scheduling before submission.
- 2026-04-28: Full e2e QA is unblocked under full local access; Chrome / Chromium now launches successfully in Codex.
- 2026-04-28: Route waypoint compatibility should use the same safe display title contract as Oracle summaries so tests and visible route labels stay aligned.
- 2026-04-28: AI second-pass QA should treat `local route stayed better` or `AI option failed validation` as successful product behavior when the visible route/preview remains intact and diagnostics are inspectable.
- 2026-04-28: The route should show a compact Time Timer-inspired countdown on the active waypoint only.
- 2026-04-28: Real today routes should tick from the browser clock; sample, demo, dev scenario, and manual-time routes should stay deterministic.
- 2026-04-29: Feature work is frozen for submission unless a blocking QA bug appears.
- 2026-04-29: Production builds should use the documented Webpack path, `next build --webpack`, because the default Next 16 Turbopack build produced a missing runtime chunk under `next start` in local packaging QA.
- 2026-04-29: Final screenshot surfaces are:
  welcome hero, How It Works modal, sample persona preview, light route with countdown + Oracle, Share route daily brief, and optional dark route.
- 2026-04-29: Submission copy is locked in `docs/submission/submission-copy.md` with the tagline:
  `Paste the day's mess in. Get back a livable route through it.`
- 2026-05-01: GitHub and Vercel are now the submission packaging path:
  source at `https://github.com/fresh-heir/waykeeper`, production at `https://waykeeper.vercel.app`.
- 2026-05-01: Multiple local plan drafts can persist at once, reload from the floating route menu, and remain until explicitly deleted.
- 2026-05-01: Welcome date/time should be live and timezone-sensitive unless the user is resuming a saved route.
- 2026-05-01: The active countdown should start filled from 0 to the block duration and drain clockwise toward 0; remaining time remains the readable text headline.
- 2026-05-01: Bottom route navigation should behave like a viewport HUD via portal, not like page content.
- 2026-05-01: Soft time-affinity heuristics may shape deterministic placement for obvious meal, day-part, prep, sequence, and business-hour tasks; explicit anchors, due times, and user locks remain stronger.
- 2026-05-01: Profile choices remain visible local metadata for summary/share copy; scheduling intelligence is limited to obvious task text and time semantics until there is a clearer post-submission model.
- 2026-05-01: The daily workspace heartbeat is retired after the submission deadline and deploy packaging.

## Moodboard inputs

Status:
- captured and ready for synthesis

Vibe words:
- luminous
- exotic
- sparkling
- spectral
- wise / oracle
- sorcery
- high contrast
- saturated hues
- deep black and bright whites
- immersive

Anti-vibes:
- muddy
- washed out
- renaissance fair
- gamified
- sterile

Reference links or images:
- reference set captured in-thread on 2026-04-22
- glowing oracle figure in a violet night garden:
  strong cue for magical intelligence, ember-like light, botanical darkness, and ritual atmosphere
- glittering iridescent ocean at night:
  strong cue for sparkle density, spectral shimmer, luminous whites, and saturated blue-violet depth
- ornate Zelda poster illustration:
  strong cue for mythic framing, high-contrast composition, architectural drama, and restrained symbolic ornament
- spectral white figure before a dark citadel:
  strong cue for wise-oracle silhouette language, deep blacks, bright whites, and sacred contrast
- peach-violet palace scene:
  strong cue for saturated complementary color play, dreamlike glow, and soft ceremonial elegance

Notes from prior conversation:
- visually compelling and unique
- memorable
- atmospheric
- not game-like
- not overdone
- product should feel premium and immersive rather than theatrical
- fantasy influence should read as residue and mythic intelligence, not cosplay

## Visual direction synthesis

Status:
- initial synthesis complete on 2026-04-22
- ready to guide concept frames and UI redesign

Emotional tone:
- luminous intelligence
- sacred calm
- nocturnal glamour
- spectral clarity
- immersive but disciplined wonder
- editorial clarity
- restrained wonder
- Scandinavian utility with vivid mythic accents

Material system:
- primary shell should move toward deep inky blacks, electric twilight violets, and crisp bright whites rather than soft beige paper as the dominant first impression
- light should feel emitted, not merely reflected: glowing accents, haloed surfaces, spectral gradients, and fine sparkle fields used sparingly
- planner surfaces should still preserve legibility through high-contrast reading planes:
  obsidian shell, moonlit cards, luminous glass, and bright route highlights
- atmospheric background treatment should feel cosmic / enchanted / oceanic rather than scenic fantasy illustration
- texture direction should favor shimmer, grain, bloom, and mist over parchment, leather, or faux-antique materials
- background strategy should not default to stark black voids:
  prefer painted art fields, illustrated atmosphere, and translucent interface planes layered over art rather than glossy dark-stage isolation
- revised default surface strategy:
  prioritize editorial layout, clean planes, measured whitespace, and crisp UI surfaces over immersive painted backgrounds
- backgrounds should appear only as intentional set pieces:
  welcome / resume hero, sample-day preview, or selected challenge/demo moments
- day-to-day planner surfaces should rely on flat color, typography, spacing, and SVG accents rather than atmospheric wallpaper

Typography direction:
- keep the main operational UI in a clean, modern sans so the planner still feels like a serious product
- add a more ceremonial high-contrast display or serif voice for branded headers, welcome moments, and Oracle framing
- typography should create drama through contrast and spacing, not through novelty or fantasy fonts
- avoid anything that reads medieval, calligraphic, or Renaissance-fair
- shift toward editorial hierarchy:
  compact labels, generous section rhythm, confident display moments, and no marketing-hero excess inside the app shell

Ornament rules:
- ornament should come from arcs, stars, glyph fragments, celestial geometry, portal frames, and subtle architectural tracery
- symbols should feel oracle-like and intelligent, not game-item collectible
- use framing sparingly around key moments:
  welcome screen, Oracle header, major state transitions, and hero sections
- route and setup screens should use ornament as atmospheric residue rather than heavy border treatment
- botanical darkness, spectral sparkles, and palace / observatory geometry are approved influences
- no literal swords, shields, quest badges, or overt RPG UI motifs in the product surface
- new accent rule:
  fantasy should mostly appear as flat bright SVG accents, icons, sigils, dividers, route marks, and small set-piece illustrations
- accents should feel Scandinavian-editorial:
  simple geometry, strong color, crisp edges, low shading, and enough restraint that the planner still feels usable

Motion rules:
- motion should feel like bloom, reveal, drift, shimmer, and eclipse rather than bounce or snap
- state changes should emphasize glow shifts, veil transitions, and layered fade/slide movement
- sparkle and particle language should remain restrained and mostly ambient
- Oracle transitions can carry the most ceremony; core planner interactions should stay faster and clearer
- revised motion stance:
  use editorial transitions and small SVG/state shifts before atmospheric spectacle

Explicit anti-patterns:
- no quest-log framing
- no faux parchment spam
- no fantasy icon overload
- no game HUD energy
- no generic corporate SaaS cleanup that removes all atmosphere
- no muddy neutrals flattening the palette
- no washed-out gradients that lose the high-contrast luminous brief
- no literal costume-fantasy interface chrome
- no sterile productivity app minimalism that erases the oracle/world premise
- no glossy fairytale / Disney-fantasy sweetness
- no black-background product shot treatment that strips out the painterly world
- no horoscope / astrology-app visual language
- no immersive background art as the default app chrome
- no generic fantasy scene behind every planner surface
- no decorative atmosphere that competes with planning clarity
- no over-rendered fantasy illustration when a flat SVG accent would carry the idea better

Recommended palette direction:
- base: obsidian, ink, midnight violet, eclipse blue
- light: moon white, spectral pearl, icy glow
- accents: electric violet, ember coral, starlight peach, iridescent aqua
- contrast principle: dark stage + radiant signal, not pastel fog + low-contrast text

Celestial Arcade refinement palette:
- keep: indigo, violet, moon white, spectral pearl
- add: jade, verdigris, moonlit leaf green, nocturnal teal
- reduce: coral-peach and orange as dominant light sources
- replace warm palace glow with cooler botanical radiance and garden-night contrast where possible

Gem-spectrum expansion note:
- do not let the direction collapse into violet-only rendering
- expand the color story across gemstone hues:
  sapphire, emerald, amethyst, opal, jade, verdigris, cobalt, spectral pearl, and selective ruby or garnet sparks
- keep contrast bold and chroma-rich rather than flattening into one cool-family wash

Reference anatomy to preserve:
- painterly grain and visible texture rather than smooth glossy rendering
- flattened but dramatic color masses, closer to poster illustration than photoreal fantasy
- translucent layers and atmospheric opacity washes over illustrated art
- strong silhouettes against luminous color fields
- ornamental framing that feels printed or drawn, not 3D-decorative
- emotionally charged color relationships with haze, bloom, and dust sitting inside the image
- background art should feel alive underneath the UI rather than replaced by a neutral presentation backdrop
- abstraction should stay high:
  use suggestion, silhouette, haze, and painterly structure rather than literal scenic storytelling

Revised reference anatomy:
- keep the bold color and graphic courage from the references
- translate fantasy into flat symbol systems, color blocks, and editorial set pieces
- use illustration as a deliberate moment, not a universal page background
- prefer Scandinavian poster / editorial discipline over immersive fantasy painting
- prioritize graphic composition:
  grids, bands, clean planes, simple ornament, and strong contrast

Design translation for product surfaces:
- Welcome / resume:
  ceremonial, high-contrast, immersive, and emotionally legible on first load
- Route + Oracle:
  dark radiant shell with bright reading planes and a visibly special Oracle surface
- Mobile route compression:
  preserve glow and contrast, but simplify ornament and sparkle density sharply

Revised product translation:
- Welcome / resume:
  editorial hero with one optional set-piece illustration or flat SVG constellation/garden motif
- Route + Oracle:
  clean planner layout with crisp Scandinavian structure and bright fantasy SVG accents around state, route, and Oracle moments
- Mobile route compression:
  strip atmosphere down to layout, color, icons, and a few high-value accents
- Backgrounds:
  reserved for set pieces; not the baseline app environment

Working art-direction statement:
- Waykeeper should feel like a luminous oracle chamber for the day:
  saturated, spectral, and wise, with deep black structure and bright high-contrast clarity, using mythic residue to create memorability without tipping into game UI or costume fantasy.

Revised working art-direction statement:
- Waykeeper should feel like an editorial Scandinavian planner touched by a bright, flat fantasy symbol system:
  clean, structured, vivid, and memorable, with set-piece art used selectively and functional screens carried by typography, spacing, color, and SVG accents.

Accepted production direction:
- desktop-first editorial planner shell with vivid gemstone accents
- primary structure:
  ink, cobalt, ultramarine, periwinkle, pearl, and clean reading planes
- accent spectrum:
  amethyst, jade, verdigris, opal, spectral cyan, chartreuse, coral / ruby sparks, and sand / ochre micro-accents
- brand primitives:
  arched window, open book, four-point sparkle-star, waymarks, starcuts, botanical cuts, and editorial accent bands
- Oracle:
  concise right-side interpretive rail with the sparkle-star as the recognizable signal
- loading / app mark:
  generated editorial set-piece art for large presentation moments; simplified SVG mark remains for favicon / small app identity

Updated asset stance:
- keep SVG for:
  app symbol, Oracle sparkle, small route marks, botanical glyphs, dividers, and UI accent bands
- use generated / raster assets for:
  welcome hero, sample-day hero, loading card hero, and app-symbol showcase
- deadline principle:
  do not hand-build painterly hero scenes in SVG if a generated asset can hit the desired mood faster and better

Implemented generated assets:
- `/public/waykeeper/welcome-hero.png`
- `/public/waykeeper/welcome-star-overlay.png`
- `/public/waykeeper/sample-day-hero.png`
- `/public/waykeeper/loading-card.png`
- `/public/waykeeper/app-symbol-showcase.png`

## Flat SVG accent system draft

Status:
- first working draft added on 2026-04-23
- use this as the next design object to critique before UI implementation

System premise:
- the app shell is editorial, practical, and structured
- fantasy appears as flat graphic punctuation:
  marks, route symbols, dividers, status accents, small icons, and occasional set-piece illustrations
- no mystical wallpaper, zodiac wheels, default star-chart backgrounds, or generic enchanted-scene chrome

Core motif families:
- waymarks:
  diamonds, forked path marks, arrows, stacked route ticks, small compass cuts, and step seals
- starcuts:
  four-point stars, eight-point sparkles, asymmetric star clusters, and bright cut-paper bursts
- botanical glyphs:
  leaf shards, thorn arcs, seed dots, vine hooks, and simplified garden silhouettes
- oracle marks:
  eye-adjacent lens shapes, speech sparks, bracketed glints, and small revelation tags without horoscope symbolism
- set-piece pieces:
  larger flat SVG scenes for welcome, sample day, or special empty states only, built from abstract garden, horizon, route, and star motifs

Shape rules:
- flat fills first; strokes second; gradients only if they are subtle and functional
- edges should feel crisp, poster-like, and slightly cut-paper
- silhouettes can be strange and expressive, but they should stay simple enough to read at UI size
- avoid ornate borders, medieval tracery, tarot-card framing, and anything that looks like a game badge
- use repetition sparingly so a motif feels branded rather than decorative spam

Color rules:
- primary structure:
  ink, off-white, soft black, icy white, and clear reading planes
- accent hue family:
  sapphire, cobalt, emerald, jade, amethyst, opal, ruby, spectral cyan, acid chartreuse, and bright pearl
- reduce orange:
  coral or peach can appear only as a small counterpoint, not as the dominant atmosphere
- avoid muddy blends:
  keep SVG accents clean, saturated, and separated from text planes
- use color as editorial signal:
  one accent family per section or state rather than every color everywhere

Screen usage:
- welcome / resume:
  can carry the largest set-piece SVG, ideally abstract garden-route-stars rather than a literal fantasy scene
- sample day:
  can use a compact set-piece preview to make the demo feel special and honest
- route:
  should use waymarks, bright step indicators, color bands, and small divider glyphs instead of immersive backgrounds
- Oracle:
  should have one distinctive oracle mark, a brighter interpretive accent color, and restrained glints around insight states
- setup:
  should feel editorial and calm, with a few crisp fantasy marks that help orientation rather than decorating every input
- mobile:
  should collapse the system to color bands, compact marks, and one or two high-value SVG motifs per view

Implementation guardrails:
- build the visual system as reusable SVG/CSS primitives, not one-off illustrated backgrounds
- keep planner readability ahead of atmospheric drama on core route screens
- use set-piece art only when it creates onboarding, demo, or empty-state meaning
- if a screen starts reading as horoscope, tarot, RPG, or Disney fantasy, remove literal symbols and return to editorial layout plus flat marks
- debug and developer surfaces should not inherit the submission art direction unless they are deliberately exposed behind secondary actions

## Concept directions

Status:
- first concept set superseded on 2026-04-23 by the editorial / Scandinavian / flat-SVG direction
- keep earlier concept notes as context, but do not treat them as the implementation target

### Concept 1 · Eclipse Chamber

Core read:
- the most dramatic and submission-forward direction
- deep obsidian shell, moon-white signal surfaces, electric violet glow, and a visibly sacred Oracle panel

Best use:
- strongest fit for welcome / resume and route + Oracle hero moments
- best option if Waykeeper should feel unmistakably unique at first glance

UI translation:
- welcome / resume:
  near-black stage, luminous title treatment, sparse ceremonial framing, bright primary CTA, and a sample-day path that feels like entering a chamber
- route + Oracle:
  Oracle becomes the brightest and most “alive” surface; the route remains crisp and high-contrast on darker structure
- mobile:
  simplify to dark stage, bright cards, and one strong spectral accent rather than many glows

Risks:
- easiest direction to overdo
- needs very disciplined spacing and typography to avoid drifting into fantasy-app theatrics

### Concept 2 · Iridescent Tide

Core read:
- a softer but still highly distinctive direction based on spectral shimmer, oceanic glow, and flowing luminous gradients
- more dreamlike and elegant, less architectural and less severe

Best use:
- strongest fit for route readability, motion language, and ambient atmosphere
- best option if the product should feel magical without feeling heavy

UI translation:
- welcome / resume:
  luminous horizon effect, glowing mist, subtle sparkle density, and gentler onboarding tone
- route + Oracle:
  cards feel like moonlit glass above an inky tide; Oracle glows through shifting spectral gradients rather than hard framing
- mobile:
  scales especially well because shimmer and contrast can survive without needing much ornament

Risks:
- can become too soft or ethereal if contrast is not protected aggressively
- needs careful dark anchors so it does not drift toward washout

### Concept 3 · Celestial Arcade

Core read:
- the most ornate and architectural direction
- luminous arches, cosmic tracery, palace / observatory cues, and controlled ornamental framing

Best use:
- strongest fit for welcome / resume, challenge screenshots, and branded marketing moments
- best option if we want a memorable product identity built around framing and ceremonial structure

UI translation:
- welcome / resume:
  portal-like hero composition, refined serif display moments, and saturated complementary color drama
- route + Oracle:
  use architecture mainly in shell framing and major section boundaries while keeping the timeline itself clean
- mobile:
  ornament must collapse sharply into small glyphs and arc fragments only

Risks:
- highest risk of slipping into decorative overload
- must be restrained inside the live planner to avoid slowing practical use

### Recommended working direction

Current recommendation:
- move away from immersive fantasy environments and toward an editorial product system
- use Scandinavian-style structure as the baseline:
  clear grids, confident whitespace, crisp flat surfaces, and restrained rhythm
- use fantasy through flat bright SVG accents:
  stars, glyphs, botanical marks, route sigils, Oracle icons, small set-piece illustrations
- reserve full backgrounds for welcome/demo set pieces only

### Current refinement note

- user feedback on 2026-04-22:
  `Celestial Arcade` is the strongest concept direction so far, but it should carry more nature influence and move away from orange-heavy warmth
- interpretation:
  keep the architectural, ceremonial, framed quality of `Celestial Arcade`, but shift it toward a nocturnal botanical arcade with cooler or more verdant chroma
- immediate design consequence:
  explore Celestial Arcade variants using moonlit garden structure, luminous foliage, violet/indigo framing, jade or verdigris accents, spectral whites, and reduced coral/orange presence
- second-round feedback on 2026-04-22:
  the refined concepts still feel too tame and too product-polished relative to the references
- second-round interpretation:
  the next visual pass should feel more like expressionist poster art fused with UI rather than clean software mockups decorated with fantasy cues
- second-round design consequence:
  push painterly lighting, bolder color blocking, dreamlike gradients, stronger silhouettes, and more emotionally charged composition while keeping the route/oracle structure readable
- third-round feedback on 2026-04-22:
  the user prefers the first expressionist concept, but wants star motifs instead of moon motifs and wants the full gemstone hue range rather than mostly purple
- third-round interpretation:
  keep the strongest composition branch from the first expressionist concept, replace lunar emphasis with celestial star geometry, and widen the chroma system into a jewel-box spectrum
- third-round design consequence:
  emphasize stars, constellations, radiant points, astral tracery, and gem-toned color blocking over moon discs or moonlit symbolism
- fourth-round feedback on 2026-04-22:
  the concepts are still missing painterly texture, art-under-glass layering, and the gritty visual components of the references; they are drifting toward generic Disney-fantasy sweetness
- fourth-round interpretation:
  stop treating the art direction as polished fantasy gloss and instead derive the interface mood from the references' real structure:
  poster-like composition, matte grain, translucent overlays, illustrated atmosphere, and bolder art-first backgrounds
- fourth-round design consequence:
  next concepts should use painted backgrounds with semi-transparent interface panels, visible grain, softer-edged blending, more printed/illustrated ornament, and an explicit rejection of black-stage product rendering
- fifth-round feedback on 2026-04-22:
  the direction is still too much; it should become more abstract and more expressionistic
- fifth-round interpretation:
  reduce literal fantasy cues, reduce ornate scene-description logic, and let color fields, texture, silhouette, and opacity layering do more of the work
- fifth-round design consequence:
  next concepts should feel less like a specific fantasy place and more like an abstract painted field with embedded celestial / botanical residue and translucent UI planes
- sixth-round feedback on 2026-04-23:
  the direction still feels too horoscope-like; the target should be more editorial, with Scandinavian-style accents and flat bright fantasy-themed SVGs
- sixth-round interpretation:
  stop making fantasy atmosphere the container; make the product layout the container and use fantasy as graphic accent language
- sixth-round design consequence:
  design should now explore editorial screens, flat SVG accent systems, bright graphic motifs, and set-piece-only illustration rather than immersive backgrounds

## Open questions

- Should post-submission work move into GitHub issues, a new roadmap doc, or both?
- Should generated assets be optimized after submission if Vercel performance data shows a real load-size issue?
- Should persistent drafts become a full named-plan library later, or stay as lightweight local recovery?
- Should profile choices eventually influence scheduling heuristics, or remain visible context and export metadata only?

## What we've done

- Audited the repo and confirmed the app already has a real planner foundation rather than only a mock shell.
- Identified the main deficits for submission readiness as first impression, visual coherence, debug-first presentation, and lack of a locked moodboard direction.
- Confirmed baseline project health on 2026-04-22 with passing `lint`, planner regression, and production build checks.
- Created this living redesign workspace file.
- Indexed this workspace from `docs/README.md` so future work has one obvious source of truth.
- Created the daily thread-heartbeat automation that keeps this workspace current when the repo materially changes.
- Captured the user's moodboard inputs:
  vibe words, anti-vibes, and five visual references.
- Converted the raw moodboard inputs into an initial art-direction synthesis with palette, material, typography, ornament, motion, and anti-pattern guidance.
- Defined three named Waykeeper concept directions:
  `Eclipse Chamber`, `Iridescent Tide`, and `Celestial Arcade`.
- Chose a provisional working blend:
  Eclipse Chamber shell, Iridescent Tide atmosphere, Celestial Arcade used selectively for branded framing.
- Logged first-round concept feedback favoring `Celestial Arcade`, with a requested shift toward more nature and less orange.
- Logged second-round concept feedback asking for more expressionistic, boldly colorful, reference-level visual intensity.
- Logged third-round concept feedback favoring the first expressionist branch, with a requested shift toward star motifs and a broader gemstone palette.
- Logged fourth-round concept feedback rejecting glossy generic-fantasy treatment in favor of painterly texture, art-under-glass layering, and deeper reference anatomy.
- Logged fifth-round concept feedback pushing the direction toward greater abstraction and less overall visual literalness.
- Logged sixth-round concept feedback pivoting away from horoscope-like atmosphere toward editorial layout, Scandinavian accents, and flat bright fantasy SVGs.
- Drafted the first flat SVG accent system:
  waymarks, starcuts, botanical glyphs, Oracle marks, set-piece boundaries, color rules, and screen-level usage.
- Locked the challenge-first roadmap around an editorial Scandinavian shell, gemstone palette, SVG-first brand primitives, today-first welcome/resume, and hidden debug surfaces.
- Added reusable brand primitives:
  `OracleSparkle`, `WaykeeperMark`, and `WaykeeperLoadingCard`.
- Added the SVG-first app symbol at `src/app/icon.svg`.
- Added the `welcome_resume` entry layer with `Start today's plan`, `Resume current plan`, and `Try sample day`.
- Wired `Try sample day` through the existing scenario/planner path instead of a static mock screen.
- Added the `Let's get to know your day` setup framing while preserving existing form behavior.
- Reworked global visual tokens and shell classes around the accepted gemstone palette.
- Restyled the planner shell, timeline, setup/review panels, and Oracle rail with the new editorial surface system.
- Hid developer/debug surfaces from the default submission UX behind `NEXT_PUBLIC_WAYKEEPER_SHOW_DEV_TOOLS=1`.
- Updated Playwright's web server command so automated tests opt into dev tools and skip the new welcome layer.
- Verified `lint`, planner regression, and production build after the first implementation pass.
- Attempted browser e2e QA, but Chromium / Chrome for Testing crashed at macOS process launch before reaching the app.
- Responded to browser review comments:
  fixed the primary CTA contrast bug, redrew the book motif to read as open pages, and pushed the welcome/loading background toward a more painterly generated-art field.
- Logged the likely asset pivot:
  generated raster set pieces for welcome/loading hero art, SVG retained for marks and UI accents.
- Generated and stored the submission set-piece assets under `public/waykeeper/`:
  welcome hero, sample-day hero, loading card, and app-symbol showcase.
- Added reusable Waykeeper UI primitives:
  panels, buttons, generated-asset wrappers, waymarks, botanical glyphs, and star accents.
- Rebuilt the welcome/resume screen around the accepted board composition:
  cream editorial panel, Waykeeper title, start/resume/sample CTAs, secondary import/help actions, and generated hero art.
- Added a sample-day preview screen before the real scenario build, then wired its CTA into the existing `normal-realistic-day` planner path.
- Added lightweight local profile fields to the setup draft and persisted session restore:
  name, journey, priorities, rhythm, and preference.
- Redesigned setup/intake into a five-step desktop flow:
  `You`, `Intentions`, `Rhythms`, `Preferences`, and `Review`.
- Replaced the primary route view with the concept-board shell:
  left navigation, center waypoint list with time rail, and right Oracle panel.
- Preserved key planner behaviors inside the new shell:
  mark complete, skip, delay, replan/tune remainder, route export, persistence, and Oracle insight/action surfaces.
- Replaced the loading presentation with generated loading-card art plus progress/status UI.
- Verified the full redesign implementation with `npm run lint`, `npm run check:planner`, and `npm run build` on 2026-04-25.
- Manually verified the main in-app flow:
  welcome CTAs, sample preview, real sample route build, route list rendering, and Oracle rail presence.
- Implemented the submission polish pass for the six browser comments:
  enlarged welcome brand/date lockup, removed duplicate giant title, replaced the hero metrics strip with the trust-route tagline, and wired `Import plan` plus `How it works`.
- Generated and added `/public/waykeeper/welcome-star-overlay.png` as a transparent sparkle overlay for the welcome hero art.
- Added a functional accessible `How it works` modal with the three-step product explanation and start/sample CTAs.
- Added sample persona selection for `Student`, `Working Professional`, and `Creative / Founder`.
- Added three broad sample scenarios:
  `sample-student-day`, `sample-working-professional-day`, and `sample-creative-founder-day`.
- Made the route + Oracle planner light mode by default and added a visible persisted `Light` / `Dark` theme toggle.
- Added focused submission-polish e2e specs for the modal, persona sample path, light default, dark toggle persistence, and route/Oracle test ID visibility.
- Verified the polish pass with `npm run lint`, `npm run check:planner`, and `npm run build` on 2026-04-26.
- Replaced generic sample-day inputs with concrete recognizable tasks:
  sociology reading response, calculus problem set, Q2 client update, launch metrics, launch email draft, pricing page copy, and product demo clips.
- Aligned sample preview labels with the scenario data that actually builds for each persona.
- Upgraded the lightweight local profile summary so journey, priorities, rhythm, and preferred day style visibly shape the right-side profile card.
- Added `daily_brief` as the default share/export format with `Today's shape`, `Now / Next`, `Schedule`, `Oracle note`, `Deferred tasks / carry-forward`, and `How to use this` sections.
- Renamed the export panel to `Share route` and kept LLM-ready/raw schedule variants available as secondary options.
- Added focused test coverage for daily brief default behavior, persona-specific sample tasks, and persisted profile summary fields.
- Restored the full Chromium e2e QA path under full local access and confirmed Chrome / Chrome for Testing no longer crash at launch.
- Added test-facing compatibility for the redesigned setup and profile summary:
  the visible setup CTA can still be driven as `Interpret tasks`, and the profile summary has a stable test target.
- Aligned route waypoint list display titles and `data-block-title` values with Oracle's safe block-title formatting.
- Updated e2e expectations for the redesigned route shell, light/dark route mode, bounded scroll behavior, restrained auto-focus, and AI second-pass outcomes.
- Verified the full non-real-AI QA suite:
  `npm run test:e2e:qa` now passes with 70 passing tests and 3 intentionally skipped real-AI smoke tests.
- Added a compact active-block countdown timer to the route waypoint list:
  the header reads `remaining of`, 0 sits at noon, labels climb counterclockwise, and the colored field drains clockwise toward 0.
- Added local live/manual planner time mode:
  real start-today routes can tick from the browser clock, while sample/dev/manual flows remain deterministic.
- Switched the production build script to `next build --webpack` after packaged `next start` exposed a missing Turbopack runtime chunk.
- Re-ran the final automated gate on the stable production path:
  `npm run lint`, `npm run check:planner`, `npm run build`, and `npm run test:e2e:qa` all passed on 2026-04-29.
- Captured the final screenshot set under `docs/submission/screenshots/`.
- Created `docs/submission/submission-copy.md` with title, tagline, descriptions, AI usage, demo instructions, screenshot order, and final local QA notes.
- Confirmed normal submission UX manually:
  welcome first, dev tools hidden, How It Works modal, Working Professional sample route, active countdown, Share route variants, theme toggle, and fresh Start today's plan intake.
- Connected the project to GitHub and pushed the submission repo to `https://github.com/fresh-heir/waykeeper`.
- Deployed the production app to `https://waykeeper.vercel.app`.
- Added live timezone/date settings for welcome and route date display.
- Added persistent multi-plan drafts with load/delete affordances in the floating bottom route menu.
- Fixed Waykeeper mark layering, contained the route sidebar navigation, and replaced the small profile art with a taller vertical set piece.
- Allowed nested fixed anchors, such as a 9-5 clinic block with a 12-1 lunch meeting inside it, without splitting the long anchor.
- Added launch helper assets and submission image files for GitHub/Vercel handoff.
- Fixed the bottom route menu to render as a viewport HUD and corrected the active countdown so it starts filled from 0 to the block duration and drains clockwise toward 0.
- Added soft time-affinity scheduling:
  meals land near meal windows, prep tasks try to happen before matching events/tasks, calls and errands prefer business hours, and impossible preferred windows fall back instead of disappearing.

## Next up

- Do a quick browser spot-check with dinner, prepare-before-event, and business-hour examples, then decide whether to commit and push this heuristic pass.

## Change log

- 2026-04-22: Created the submission redesign workspace document.
- 2026-04-22: Indexed the workspace from `docs/README.md`.
- 2026-04-22: Recorded the initial redesign decisions, current-state snapshot, and phased roadmap.
- 2026-04-22: Activated the daily thread-heartbeat automation for workspace upkeep.
- 2026-04-22: Added moodboard inputs, visual reference analysis, and the initial art-direction synthesis.
- 2026-04-22: Added three named UI concept directions and a provisional recommended blend.
- 2026-04-22: Logged feedback favoring `Celestial Arcade` and refined it toward nocturnal botanical, less-orange variants.
- 2026-04-22: Logged feedback that the refined concepts need to be more expressionistic and boldly colorful.
- 2026-04-22: Logged feedback selecting the first expressionist branch and steering it toward stars and gemstone hues.
- 2026-04-22: Logged feedback pushing the direction toward painterly texture, art-under-glass backgrounds, and away from glossy generic-fantasy styling.
- 2026-04-22: Logged feedback pushing the direction toward greater abstraction and more expressionistic restraint.
- 2026-04-23: Pivoted the design direction toward editorial Scandinavian structure with flat bright fantasy SVG accents and set-piece-only backgrounds.
- 2026-04-23: Added a first draft of the flat SVG accent system and updated next steps around motif selection.
- 2026-04-23: Locked the accepted challenge-first roadmap and implemented the first redesign pass across brand primitives, welcome/resume, loading/app mark, shell styling, hidden dev tools, and Playwright env support.
- 2026-04-23: Verified lint, planner regression, and production build after implementation.
- 2026-04-23: Recorded Chromium / Chrome for Testing launch crashes as an environment blocker for local browser e2e QA in Codex.
- 2026-04-25: Fixed browser-review issues for CTA contrast and unclear book geometry; recorded generated hero assets as the likely deadline path for welcome/loading art.
- 2026-04-25: Implemented the full desktop UI/UX redesign with generated set-piece assets, guided profile intake, sample-day preview, route waypoint shell, and Oracle rail.
- 2026-04-25: Verified lint, planner regression, production build, and manual in-app welcome-to-sample-route flow after the full redesign pass.
- 2026-04-26: Implemented browser-comment polish: light-default planner theme, welcome lockup/tagline/modal, sample personas, generated sparkle overlay, and broad sample scenarios.
- 2026-04-26: Verified lint, planner regression, and production build after the polish pass.
- 2026-04-27: Implemented near-deadline autopilot polish for concrete sample days, useful local profile metadata, and daily brief route sharing.
- 2026-04-27: Verified lint and planner regression after the autopilot pass.
- 2026-04-27: Verified production build and static Playwright test listing after the autopilot pass.
- 2026-04-28: Unblocked Chromium e2e execution under full local access, updated redesigned-shell compatibility coverage, and verified `npm run test:e2e:qa` with 70 passing tests and 3 intentional skips.
- 2026-04-28: Added active-route countdown timer planning/implementation notes and live-real-day time-mode decision.
- 2026-04-29: Froze feature scope, switched production build to Webpack for stable packaging, captured final screenshots, wrote submission copy, and verified lint, planner regression, production build, e2e QA, and manual production smoke.
- 2026-05-01: Recorded GitHub/Vercel production state, persistent drafts, live timezone/date settings, nested fixed-anchor handling, launch helpers, and final floating-nav/countdown polish; retired the daily workspace heartbeat.
- 2026-05-01: Added soft time-affinity heuristics for meals, day parts, prep ordering, business-hour tasks, simple sequences, and Oracle replan preservation; verified planner, lint, and build.
