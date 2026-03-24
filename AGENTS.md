# AGENTS.md

This file captures the repo-specific conventions, product decisions, and implementation preferences that have emerged during development. Future agents should treat this as operating guidance for changes in this workspace.

## Project Identity

- Product name: `SHARDLINE`
- Genre: top-down neon wreck racer
- Core promise: short, violent, replayable procedural races with aggressive presentation, destructive collisions, and a garage/foundry meta loop
- Tone: hard-edged, destructive, kinetic, premium arcade
- Avoid marketing language that oversells safety or softness. Mechanics can be forgiving, but player-facing copy should sell speed, impact, rivalry, and escalation.

## Product Priorities

Optimize for these, in order:

1. Moment-to-moment race readability and fun
2. Fast replayability and low-friction race start
3. Strong visual identity and race drama
4. Meaningful garage/foundry progression
5. Deterministic procedural variety

If a change adds complexity but does not improve one of those, it is probably the wrong change.

## Agent Workflow

- Read `progress.md` before substantial work and append meaningful passes afterward.
- Validate with evidence, not just code inspection:
  - use `npm run validate` as the baseline for meaningful changes
  - use targeted screenshots / JSON capture for race-view or generator changes
- If you create temporary scripts for validation, keep them small and delete them unless they are genuinely reusable.
- Close stale subagents when they are no longer needed.
- Reuse or close long-running exec sessions where possible. This repo often hits the unified-exec process limit if sessions are left open.

## UI And Layout Conventions

- Favor single-viewport layouts. Do not solve density problems with scrolling unless absolutely necessary.
- Prefer wider shells that use more of the viewport over globally shrinking the entire UI.
- When content gets dense, reflow, split into tabs/panes, or cut copy. Do not just reduce scale.
- The current menu flow is intentionally two-step:
  - splash/title screen first
  - setup hub second
- Use grouped tabs/modal flows rather than long stacked pages.
- Keep card widths consistent across comparable surfaces.
- Secondary explanatory copy should usually live behind tooltip/info buttons, not permanently in the main layout.
- Tooltips are contextual and should support click and delayed hover. Do not reintroduce noisy always-visible helper text.
- Improve border/background contrast when adding new surfaces. Panels should separate clearly from the backdrop.

## Race HUD Conventions

- The race view should prioritize racing, not reading.
- Keep HUD information on the edges where possible.
- Remove low-value or redundant race UI instead of preserving everything.
- Use short, glanceable labels. Avoid verbose copy in-race.
- Countdown/start messaging is special-case presentation, not a normal banner.
- Countdown should be centered, dramatic, and readable at a glance.
- Race results should feel like motorsport timing, not arcade score spam:
  - full-field classification
  - total race times / gaps
  - lap splits where applicable
  - one dominant next action

## Race Presentation Conventions

- Off-track environment must never overlap the racing surface. Decorative scenery belongs outside the road corridor.
- The road must remain the dominant readable shape in any capture.
- Off-track worldbuilding should read as actual venue identity:
  - `industrial`: neon city / yard / crane / forge-zone feel
  - `freeway`: embankments, hillside, pines, lit causeway structures
  - `void`: shard forest / monolith field / surreal geometry
- Background and off-track scenery should have restrained ambient motion:
  - very slow pulsing / fade / drift is good
  - constant noisy flicker is not
- Vehicle trails should:
  - eject from the rear of the body, not the center
  - begin with the rear body width
  - taper backward like slipstream / flame
  - get longer under boost / heavy acceleration states

## Visual Direction

- Palette should be hard neon, not pastel.
- Good references for intensity and palette energy:
  - Rocket League
  - Supermassive arcade/sci-fi lighting sensibilities
  - Dead Cells for contrast and punch
- Favor blacklight cyan, magenta, amber, acid teal, hot red accents, and deep near-black backgrounds.
- Menus should feel poster-like and deliberate, not generic dashboards.
- Use strong glow, contrast, silhouette clarity, and readable hierarchy.

## Vehicle Art Direction

- Vehicle silhouettes should reflect stats, not just paint colors.
- Use hypercar / F1 monocoque inspiration rather than generic stock-car bodies.
- Stat-driven shape cues:
  - durability: wider body, heavier tyres, chunkier stance
  - top speed: narrower nose, longer tapered body, sharper profile
  - acceleration/launch: bigger rear engine mass, stronger rear block
  - handling: tighter, more planted mid-body proportions
- Destroyed cars should remain recognizable wrecked versions of the same silhouette, not collapse into a generic husk.

## Track And Race Rules

- Both circuits and sprints are first-class.
- Start/finish lines must:
  - sit on a straight
  - stretch across the full width of the track
  - be the authoritative lap/finish gate
- Do not use loose radius checks around checkpoint 0 as a substitute for lap detection.
- Prefer actual line/gate crossing logic for progress-sensitive race rules.
- Track generation should avoid impossible corner angles and should produce good sector variability.
- Named route motifs like hairpins, chicanes, and S-bends are desirable, but they still need to pass playability constraints.
- Track shapes should lean closer to real racing-course logic:
  - fewer constant-amplitude zig-zags
  - less perfect circular symmetry
  - more uneven spacing between straights and complexes
  - a small number of committed direction-change sequences rather than many weak reversals
- Soft left-right wiggles should not be treated as valid chicanes.
- Valid switchbacks/chicanes should require more severe reversal angles than gentle bends.
- If tightening motif rules, tune both:
  - motif shaping
  - geometry analysis / validation thresholds
  so the generator does not falsely “pass” weak switchbacks or falsely reject every circuit for lacking one.

## Rival And AI Behavior

- Rivals should remain visible, present, and course-valid. Do not allow them to drift into broken off-course states.
- AI should obey the same core course rules as the player:
  - follow the route
  - advance through ordered course progression
  - respawn back onto the course when destroyed or irrecoverably off-line
- If AI can get stuck, wrong-way, or effectively disappear, treat that as a bug.

## Fairness And Damage

- The game should be dramatic without being overly punishing.
- Mistakes should cost time, pressure, or position before they cost the whole run.
- Recovery systems are part of the design:
  - short respawns
  - assist windows
  - anti-frustration resets
- Keep this true mechanically, but do not make "forgiving recovery" the top-line marketing message.

## Progression And Economy

- New players start with:
  - one intentionally weak but balanced starter car
  - two visibly open garage slots
- Garage loop:
  - spend `Flux` to roll three cars in the Foundry
  - keep any subset
  - rejected cars are sold for `Scrap`
- `Scrap` is the aesthetics currency for cosmetics like skins, trails, tyre marks, and emotes.
- Rolled cars are not guaranteed to be better. Roll quality should improve over longer play, not per-roll certainty.
- Players can spend a small amount of Flux to reforge/regenerate the strike board course lineup.
- Players can also lock a custom replay seed per non-daily course from the menu to replay favorite layouts.
- Guided run and daily challenge should remain protected from routine board rerolls unless explicitly intended.
- A limited starter cosmetic set should be free by default.
- Style Locker previews should feel alive; static cosmetic thumbnails are usually undercooked.

## Copy And Branding

- Use `SHARDLINE` branding consistently.
- Favor aggressive, punchy copy:
  - good: "Break the line", "Field broken", "Killbox live"
  - weak: "Speedy recovery", "Safe reset", "Helpful retry"
- Keep visible copy sparse and readable.
- If a piece of copy is explanatory rather than motivational or decision-critical, it probably belongs in a tooltip.

## Technical Conventions

- The runtime is modular under `src/`. Do not reintroduce legacy single-file game logic.
- `src/main.js` owns runtime loop, rendering, and presentation glue.
- `src/core/gameplay.js` owns race rules, collisions, respawn, AI, and progression through a run.
- `src/core/generator.js` owns seeded course generation and track descriptors.
- `src/core/ui.js` owns menu, HUD, results, tooltips, and shell behavior.
- `style.css` is the main visual system; layout changes usually need CSS and UI changes together.
- Reusable validation / review scripts belong in `scripts/` if they are likely to be useful again.
- Prefer data/logic changes that preserve deterministic seeded behavior.

## Validation Expectations

- Minimum validation for meaningful gameplay/UI changes:
  - `npm run validate`
- If you touch race flow, generator logic, lap detection, respawn behavior, or HUD:
  - run targeted browser checks, not just syntax
  - capture screenshots or JSON state when useful
- If you touch race presentation or environment art direction:
  - do a visual review with actual screenshots
  - inspect the screenshots directly, not just their existence
- Useful recurring checks in this repo include:
  - `node scripts/capture-ui-states.mjs`
  - `node scripts/capture-responsive-layouts.mjs`
  - `node scripts/capture-subnav-layouts.mjs`
  - `node scripts/audit-layout-overflow.mjs`
  - `node scripts/review-section-breakpoints.mjs`
  - `node scripts/check-garage-loop.mjs`
  - `node scripts/check-copy-audio.mjs`
  - `node scripts/review-race-scenes.mjs`
  - `npm run validate:content`
- Prefer evidence-backed fixes over assumption-driven tweaks.

### UI Review Script Map

- Use `node scripts/review-section-breakpoints.mjs` when doing breakpoint or section-placement review work across the main hub screens. It captures `Race`, `Garage`, `Foundry`, `Style`, `Career`, and `Settings` at `1920x1080`, `1536x864`, `1441x900`, `1366x768`, `800x600`, `844x390`, and `812x375`, and writes screenshots plus geometry JSON to `output/section-review-current/`.
- Use `node scripts/capture-responsive-layouts.mjs` for a faster smoke pass on the standard shell states (`splash`, `setup`, `garage`, `foundry`, `settings`, `pause`) without generating the full breakpoint matrix.
- Use `node scripts/capture-ui-states.mjs` when you need canonical screenshots paired with `render_game_to_text` JSON for the major menu, race, pause, and results states.
- Use `node scripts/capture-subnav-layouts.mjs` after nav, subnav, or route-section changes to verify that top-level tabs and workspace subtabs still land on the intended screens and sections.
- Use `node scripts/audit-layout-overflow.mjs` when viewport fit, clipping, or hidden overflow is in question. Treat it as a geometry audit, not a substitute for screenshot review.
- Use `node scripts/check-garage-loop.mjs` after changes that touch `Garage`, `Foundry`, `Style`, roll/equip flows, or currencies. It exercises the Foundry roll plus Style purchase/equip loop and writes a focused report to `output/`.
- Use `node scripts/check-copy-audio.mjs` after tooltip timing, copy clamping, menu text density, or menu/race audio-state changes. It checks tooltip modes, copy overflow, and menu/race/pause audio transitions.
- Use `node scripts/review-race-scenes.mjs` after race presentation, environment art direction, or track-readability changes. It captures targeted race scenes rather than menu shells.

### Preferred UI Validation Sequences

- For general menu-shell or breakpoint work:
  - `node scripts/review-section-breakpoints.mjs`
  - `node scripts/capture-responsive-layouts.mjs`
  - `node scripts/audit-layout-overflow.mjs`
  - `npm run validate`
- For nav or subnav changes:
  - `node scripts/capture-subnav-layouts.mjs`
  - `node scripts/capture-ui-states.mjs`
  - `npm run validate`
- For `Garage` / `Foundry` / `Style` loop changes:
  - `node scripts/check-garage-loop.mjs`
  - `node scripts/review-section-breakpoints.mjs`
  - `npm run validate`
- For tooltip / copy / audio changes:
  - `node scripts/check-copy-audio.mjs`
  - `node scripts/capture-ui-states.mjs`
  - `npm run validate`
- For race-view visual changes:
  - `node scripts/review-race-scenes.mjs`
  - `node scripts/capture-ui-states.mjs`
  - `npm run validate`

## Change Heuristics For Future Agents

- If the UI feels cramped, first try:
  - removing low-value content
  - splitting into tabs/panes
  - widening the shell
  - reflowing layout
  - only then consider modest scale changes
- If the race screen feels weak, first try:
  - removing HUD clutter
  - improving camera/effects/countdown
  - making rivals and sectors more legible
- If progression feels weak, first try:
  - clearer reward surfacing
  - stronger Foundry/cosmetic feedback
  - stronger replay prompts

## Files Worth Reading First

- `README.md`
- `docs/product-intent.md`
- `docs/frontend-audit-2026-03-21.md`
- `src/main.js`
- `src/core/ui.js`
- `src/core/gameplay.js`
- `src/core/generator.js`
