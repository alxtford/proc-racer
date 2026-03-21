# Frontend Audit 2026-03-21

## Scope

This audit reviews the current Proc Racer experience across three journeys:

- first-time player
- quick-replay arcade player
- returning mastery player

The goal is to test whether the current frontend proves the product value defined in [product-intent.md](product-intent.md), not just whether the UI looks polished.

## Visual Review Lens

- Visual thesis: kinetic neon arcade racing with forgiving destruction and immediate replay energy
- Content plan: prove the fantasy fast, reduce setup friction, make the next useful action obvious
- Interaction thesis: launch quickly, recover quickly, retry quickly

## Consolidated Findings

### P0. The product promise is still implicit instead of explicit.

The menu says “Retro Futurist Circuit Violence” and shows a large logo, but it does not clearly explain the actual player value: fast arcade racing, stylish wrecks, forgiving recovery, and immediate replay. The strongest screen real estate goes to branding and mood, while the reason to care is buried in smaller support copy and hero points.

Evidence:

- [index.html](../index.html)
- Local capture: `output/vertical-slice-menu.png`

Why this matters:

- First-time players are asked to choose before the game has sold the fantasy.
- Quick-replay players are slowed down by copy that does not help them act.

### P0. The first-run path is not intentionally narrowed.

The tutorial event exists in data, but the menu still presents the same overall information load as if the player were already familiar with the game: career chip, daily chip, full event browser, full car browser, controls block, focused event panel, and multiple supporting hero tiles. The screen reads like a complete dashboard rather than a guided “start here” experience.

Evidence:

- [src/data/content.js](../src/data/content.js)
- [src/core/ui.js](../src/core/ui.js)
- Local capture: `output/vertical-slice-menu.png`

Why this matters:

- The onboarding route is present in systems but not expressed in the interface.
- The game spends too much of the first decision budget on browsing.

### P0. The UI prefers system metadata over decision-making information.

The interface repeatedly surfaces seed-adjacent or system-adjacent data like AI count, biome, modifier labels, wins count, car count, and raw stat values. What the user actually needs depends on the journey:

- first-time player: easiest start, what they will learn, how long the run lasts
- quick-replay player: duration, difficulty, recommended next action, best-time delta
- returning player: par target, PB, medal progress, daily relevance, unlock relevance

The current menu favors implementation metadata over “why choose this now.”

Evidence:

- [src/core/ui.js](../src/core/ui.js)
- Local capture: `output/vertical-slice-daily-menu.png`

### P0. The tutorial promise is not fulfilled end to end.

The tutorial event claims to teach pickups, forgiving recovery, and momentum, but the current experience still allows the player to finish without using a pickup and receive `MISS Use any pickup` on the results screen. That means the authored promise in content is not matched by UI surfacing, track affordance, or results messaging.

Evidence:

- [src/data/content.js](../src/data/content.js)
- [src/core/ui.js](../src/core/ui.js)
- Local capture: `output/vertical-slice-results.png`

Why this matters:

- This is a product-alignment failure, not a minor tuning issue.
- If the tutorial misses its signature mechanic, the first session under-sells the whole game.

### P1. Quick replay is supported mechanically but not sold behaviorally.

`Quick Remix` exists, but it is secondary in styling and vague in naming. It reads more like a flavor option than a “get me back into action now” path. The menu still assumes browsing, not momentum. A replay-focused player needs explicit high-speed actions such as retry last race, same car new event, daily run, or random run now.

Evidence:

- [index.html](../index.html)
- Local capture: `output/vertical-slice-menu.png`

### P1. Car selection language is split between fantasy copy and spreadsheet values.

The current car experience mixes short fantasy descriptions in the focus area with raw `accel/top/turn` strings and percentage stat tiles. That creates two problems:

- beginners do not know how to interpret the numbers
- quick-replay players do not get fast identity cues like “safe starter,” “fast but unstable,” or “best for corners”

Evidence:

- [index.html](../index.html)
- [src/core/ui.js](../src/core/ui.js)

Why this matters:

- Car choice should be about feel, risk, and recommendation before it is about tuning precision.

### P1. The race HUD has too many concurrent surfaces and duplicates information.

The game currently shows:

- top-left event panel
- top-right race stats
- center toast/banner
- tutorial card
- bottom HUD modules
- minimap

This means the player is competing with the interface for track visibility. It also duplicates concepts across the old top panels and the new bottom HUD. Labels like `Assist respawn shield`, `Slipstream idle`, and mid-race seed/biome strings feel more like internal status readouts than player-value communication.

Evidence:

- [index.html](../index.html)
- [src/core/ui.js](../src/core/ui.js)
- [style.css](../style.css)
- Local capture: `output/vertical-slice-race-4.png`

### P1. Results presentation is polished but emotionally flat.

The results screen looks clean and readable, but it mainly reports facts: place, time, respawns, wall hits, pickups used, and goal pass/miss. It does not yet answer the replay-driving questions:

- was this a PB?
- how close was I to my target?
- what changed from last run?
- what should I chase next?
- what did I unlock or nearly unlock?

Evidence:

- [src/core/ui.js](../src/core/ui.js)
- Local capture: `output/vertical-slice-results.png`

### P1. Returning-player value is under-signaled even though the systems exist.

The repo already has:

- event goals
- daily challenge generation
- save data
- best times
- ghost persistence
- unlockable car

But the frontend barely surfaces these as reasons to return. `Daily challenge live` and `Daily best` are passive status chips. The daily event has more visual weight than a normal card only by badge text. There is no obvious medal ladder, no PB delta on results, no ghost surfaced in the menu, no next unlock explanation, and no visible “why today” framing.

Evidence:

- [src/core/save.js](../src/core/save.js)
- [src/data/content.js](../src/data/content.js)
- [src/core/ui.js](../src/core/ui.js)
- Local capture: `output/vertical-slice-daily-menu.png`

### P2. Product intent was previously implicit in implementation and progress notes, not documented.

The repo had implementation, validation, and progress tracking, but no durable product source of truth. That gap is now addressed by:

- [README.md](../README.md)
- [product-intent.md](product-intent.md)

This should remain a guardrail so future UI additions do not drift back toward system-complete but value-obscured surfaces.

## Ranked Action List

### 1. Rebuild the first menu around one recommendation and one fallback.

- Default the whole screen to “Start Tutorial” or “Continue Run” for the first-time path.
- Collapse most event browsing until after the first completion.
- Demote or hide career/daily/meta chips during onboarding.

### 2. Rewrite the hero and primary CTA around player value, not atmosphere.

- Replace mood-first copy with a one-line promise about fast neon racing, stylish wrecks, and fast recovery.
- Rename `Quick Remix` to an outcome-led action.
- Make the first two actions unmistakable: recommended start and instant random run.

### 3. Replace metadata-heavy event cards with decision-heavy summaries.

- Show duration, difficulty, primary goal, and best-time context.
- Reduce repeated biome and AI labels.
- Make daily and tutorial cards visually and functionally distinct, not just text-badged.

### 4. Rework car choice into feel-first language.

- Add recommendation tags such as `Best Starter`, `Fastest`, `Safest`, `Hardest`.
- Replace raw `accel/top/turn` strings with concise player-language traits.
- Keep deep numbers secondary or hidden.

### 5. Collapse the HUD into one dominant layer.

- Remove duplicated top-right or top-left state that is already covered below.
- Replace internal labels with player-facing guidance.
- Reserve screen space for track visibility first, not instrumentation.

### 6. Make the tutorial mechanically guaranteed to teach pickups.

- Force a pickup into the obvious racing line.
- Tie the tutorial step copy to a visible on-track cue.
- Do not allow the tutorial to report failure on its signature lesson without the interface clearly having surfaced that lesson.

### 7. Turn results into a replay trigger.

- Add PB delta, goal delta, medal context, and next recommended action.
- Tell the player why to retry now.
- Surface unlock progress and daily relevance when applicable.

### 8. Surface mastery systems deliberately.

- Give the daily challenge a stronger reason-to-click treatment.
- Show what ghosts, bests, and medals mean in the loop.
- Make long-term improvement visible without making the menu heavier.

## Summary

The current frontend is visually strong enough to suggest a premium arcade racer, but it still behaves like a complete feature surface instead of a ruthless player-value surface. The core issue is not polish. The core issue is prioritization: the repo currently exposes too much system state before, during, and after a run, while under-explaining why each journey should care right now.
