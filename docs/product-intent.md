# SHARDLINE Product Intent

## Product Thesis
SHARDLINE is a fast-launch neon wreck racer for short repeat sessions. The value proposition is immediate access to a brutal procedural race, readable destructive spectacle, and enough mastery hooks to make "one more run" feel justified.

## Player Promise
- Start a race in seconds, not minutes.
- Make mistakes without feeling the run is dead.
- Read the course and car choice quickly.
- Feel a difference between archetypes, events, and daily seeds.
- Always know what is worth chasing next.

## Primary User Journeys

### First-Time Player
Wants to understand what the game is, how to start, and why it is fun before reading much.

### Quick Replay Player
Wants to launch, retry, and remix runs with almost no friction. Cares about pace, clarity, and instant restart.

### Returning Mastery Player
Wants visible proof of progress. Cares about best times, goals, medals, unlocks, rivals, and why today's daily matters.

## Core Loop
1. Pick a race and car with minimal setup friction.
2. Run a short event with readable stakes.
3. Recover from mistakes and stay in contention.
4. Finish with a clear summary of what improved or was missed.
5. Get an obvious next action: retry, continue ladder, or run the daily.

## UX Hierarchy

### Menu
The menu should answer:
- What should I run next?
- Why is that run worth doing?
- Which car fits my intent?
- Is the daily challenge worth my time right now?

### Race HUD
The HUD should answer:
- Am I winning or losing ground?
- What is my current goal?
- How damaged am I?
- What pickup do I hold?
- What high-pressure relationship matters right now?

### Results
The results screen should answer:
- What improved?
- What did I miss?
- Did I unlock or advance anything?
- What should I do next?

## Value Pillars
- Fast start: the default path should be one primary launch action.
- Violent but readable: collisions should feel intense without making minor mistakes fatal.
- Readable variety: biome, format, modifiers, and car choice should change texture, not just labels.
- Visible mastery: bests, medals, goals, rivals, and dailies must be legible before and after a run.

## Repo Mapping
- Product content and authored event value live in `src/data/content.js`.
- Progression, persistence, and long-term value systems live in `src/core/save.js`.
- Menu, HUD, tutorial, and results presentation live in `index.html`, `style.css`, and `src/core/ui.js`.
- Fairness and damage feel live in `src/core/gameplay.js`.
- Variety and track readability live in `src/core/generator.js`.
- Race presentation, camera, and VFX live in `src/main.js` and `src/core/audio.js`.

## Guardrails For Future Changes
- Do not add more setup options unless they shorten a real player decision.
- Do not surface technical data ahead of player stakes.
- Do not add progression systems that are invisible in the menu or results.
- Do not track mastery data in save state without surfacing it somewhere meaningful.
- Do not let tutorial or support UI obstruct the playable action area once the player understands the basics.
