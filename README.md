# Proc Racer

[![Validate](https://github.com/alxtford/proc-racer/actions/workflows/validate.yml/badge.svg)](https://github.com/alxtford/proc-racer/actions/workflows/validate.yml)

Top-down browser arcade racer built for fast starts, forgiving mistakes, and short-session replayability.

## Product

The product intent is documented in [docs/product-intent.md](docs/product-intent.md).

The current UX and frontend audit is documented in [docs/frontend-audit-2026-03-21.md](docs/frontend-audit-2026-03-21.md).

## Run

`npm install`

`npm start`

Open `http://127.0.0.1:4173`.

## Validate

`npm run validate`

This entrypoint is self-contained. It starts a temporary static server, runs seeded generation checks, and runs the garage/foundry browser validation.

## Repository Notes

- Generated screenshots and browser traces under `output/` are local validation artifacts and are not tracked.
- `progress.md` is a local working log and is intentionally ignored.
- Source of truth for product direction lives in `README.md` and `docs/`.
- Contributor workflow lives in [CONTRIBUTING.md](CONTRIBUTING.md).

## Repo Map

- [index.html](index.html): app shell, menu, HUD, results overlay
- [style.css](style.css): visual system and layout
- [src/main.js](src/main.js): runtime loop, rendering, camera, input, flow
- [src/core/ui.js](src/core/ui.js): user-facing copy, menu sync, HUD, results
- [src/core/gameplay.js](src/core/gameplay.js): driving, damage, respawn, pickups, AI interactions
- [src/core/generator.js](src/core/generator.js): seeded track generation and event beats
- [src/core/save.js](src/core/save.js): progression, bests, ghost persistence
- [src/data/content.js](src/data/content.js): authored events, cars, modifiers, pickups, biomes
- [scripts/validate-content.mjs](scripts/validate-content.mjs): seeded content sanity checks
- [scripts/check-garage-loop.mjs](scripts/check-garage-loop.mjs): garage/foundry UI and economy sanity checks
- [scripts/run-validate-suite.mjs](scripts/run-validate-suite.mjs): temporary static server plus full validation entrypoint

## Design Guardrails

- Launch a race in seconds.
- Make mistakes sting, not kill the run.
- Keep UI readable at speed.
- Give returning players a reason to improve and return.
- Favor atmosphere and motion over clutter.
