# SHARDLINE

[![Validate](https://github.com/alxtford/proc-racer/actions/workflows/validate.yml/badge.svg)](https://github.com/alxtford/proc-racer/actions/workflows/validate.yml)

SHARDLINE is a top-down neon wreck racer built for short, violent procedural runs, aggressive bodywork damage, and a Foundry loop that keeps feeding better metal into the garage.

## What Ships Today

- Seeded circuit and point-to-point races.
- Arcade handling, AI rivals, pickups, damage, wrecks, and dramatic respawn resets.
- A Foundry garage loop with starter cars, random rolls, scrap, and cosmetic unlocks.
- A replay-first menu flow with daily challenges and short-session progression.

## Quick Start

Requires Node 20+.

```bash
npm install
npm start
```

Open `http://127.0.0.1:4173`.

## Validate

```bash
npm run validate
```

This command is self-contained. It starts a temporary static server, runs seeded content checks, and runs the garage/foundry browser validation.

## Key Files

- [src/main.js](src/main.js): runtime loop, rendering, camera, flow, and effects
- [src/core/ui.js](src/core/ui.js): menu, HUD, tooltips, garage, results, and onboarding copy
- [src/core/gameplay.js](src/core/gameplay.js): driving, damage, respawn, pickups, and AI interactions
- [src/core/generator.js](src/core/generator.js): seeded track generation and event beats
- [src/core/save.js](src/core/save.js): progression, garage persistence, unlocks, and ghost data
- [src/data/content.js](src/data/content.js): authored cars, events, biomes, pickups, and modifiers
- [scripts/run-validate-suite.mjs](scripts/run-validate-suite.mjs): full local validation entrypoint
- [scripts/serve.mjs](scripts/serve.mjs): local static server used by `npm start`

## Docs

- [docs/product-intent.md](docs/product-intent.md): product thesis and UX guardrails
- [docs/frontend-audit-2026-03-21.md](docs/frontend-audit-2026-03-21.md): frontend review and follow-up findings
- [CONTRIBUTING.md](CONTRIBUTING.md): contributor workflow and validation expectations

## Repository Notes

- Generated screenshots and browser traces under `output/` are local validation artifacts and are not tracked.
- `progress.md` is a local working log and is intentionally ignored.
- Source of truth for product direction lives in `README.md` and `docs/`.
- The runtime is modular under `src/`; do not reintroduce legacy single-file game logic.
