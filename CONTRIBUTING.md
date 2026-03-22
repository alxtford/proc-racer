# Contributing

## Local Setup

`npm install`

`npm start`

Open `http://127.0.0.1:4173`.

## Automation Setup

One-time GitHub auth setup for worktree automations:

`powershell -ExecutionPolicy Bypass -File C:\Users\AlexFord\.codex\automations\setup-proc-racer-automation-gh.ps1`

This prompts for a GitHub token and stores it as the user environment variable `GH_TOKEN` for future Codex sessions.

Worktree automations should then bootstrap from the worktree itself:

`powershell -ExecutionPolicy Bypass -File scripts/codex-automation-setup.ps1 -RequireGh`

This script:

- installs dependencies when `node_modules/` is missing or stale for that worktree
- requires `GH_TOKEN` or `GITHUB_TOKEN` to already be present in the environment

Interactive `gh` keyring auth is not enough for background worktree automations. They should use an environment variable instead.

Cleanup command if you want to remove the automation token later:

`powershell -ExecutionPolicy Bypass -File C:\Users\AlexFord\.codex\automations\cleanup-proc-racer-automation-gh.ps1`

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
- violent but readable collisions and short-run replay value
- readable procedural variety
- visible replay/mastery hooks

## Repository Notes

- `output/` is local validation output and is not tracked.
- `progress.md` is a local working log and is not tracked.
- Prefer extending the modular runtime under `src/` rather than reviving legacy one-file code paths.

## GitHub Issue Workflow

Backlog work is tracked in GitHub Issues and the Codex worker flow is documented in [docs/github-issue-workflow.md](docs/github-issue-workflow.md).

Useful commands:

- `npm run issues:auth`
- `npm run issues:labels`
- `npm run issues:board`
- `npm run issues:pick`
- `node scripts/codex-issues.mjs start-next --json`
- `node scripts/codex-issues.mjs finish --issue <number> --validation "npm run validate"`
- `node scripts/codex-issues.mjs block --issue <number> --label codex:needs-human --reason "..."`

## Pull Requests

Keep PRs scoped and include:

- what changed
- why it improves player value or repo quality
- what validation you ran
