# Contributing

## Local Setup

`npm install`

`npm start`

Open `http://127.0.0.1:4173`.

## Validation

`npm run validate`

This command starts its own temporary static server, runs seeded content checks, and runs the garage/foundry browser validation.

## Product Guardrails

Before changing menu flow, HUD, results, or progression behavior, read:

- [README.md](README.md)
- [docs/product-intent.md](docs/product-intent.md)
- [docs/frontend-audit-2026-03-21.md](docs/frontend-audit-2026-03-21.md)

The repo is biased toward:

- fast race launch
- forgiving recovery after mistakes
- readable procedural variety
- visible replay/mastery hooks

## Repository Notes

- `output/` is local validation output and is not tracked.
- `progress.md` is a local working log and is not tracked.
- Prefer extending the modular runtime under `src/` rather than reviving legacy one-file code paths.

## Pull Requests

Keep PRs scoped and include:

- what changed
- why it improves player value or repo quality
- what validation you ran
