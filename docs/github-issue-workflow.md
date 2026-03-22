# GitHub Issue Workflow

This repo uses GitHub Issues as the source of truth for backlog work. Codex should implement one issue at a time, open a PR for that issue, and leave everything else in the issue queue.

## Labels

Use exactly one label from each of these groups when possible:

- `type:bug`, `type:feature`, `type:polish`, `type:chore`
- `priority:P0`, `priority:P1`, `priority:P2`, `priority:P3`
- `size:S`, `size:M`, `size:L`

Use these execution labels to control automation:

- `codex:ready`: safe for autonomous implementation
- `codex:needs-human`: needs design, product, or technical direction before implementation
- `codex:blocked`: waiting on another dependency or external change
- `status:in-progress`: currently being worked
- `status:has-pr`: implementation PR is open and the issue should not be auto-claimed again

## Priority Rules

Prioritize issues in this order:

1. Highest priority label first: `P0` before `P1` before `P2` before `P3`
2. Smaller issues first when priority is tied: `S` before `M` before `L`
3. Oldest issue first when priority and size are tied

Repo-specific guidance:

- `P0`: broken race flow, AI going course-invalid, save corruption, generator regressions that break seeded content, severe validation failures
- `P1`: major HUD/readability issues, fairness problems, broken garage/foundry loops, strong presentation regressions
- `P2`: meaningful follow-up implementation or polish
- `P3`: speculative ideas, low-impact cleanup, backlog tail

## Issue Standard

Every implementation issue should make these things explicit:

- the player or repo problem
- the desired outcome
- acceptance criteria
- validation expectations
- blockers or dependencies

If an issue does not have enough information for safe implementation, it should stay `codex:needs-human`.

## Codex Worker Loop

The autonomous worker follows this loop:

1. Select the highest-priority open issue labeled `codex:ready` and not labeled `codex:blocked`, `codex:needs-human`, `status:in-progress`, or `status:has-pr`
2. Create a branch named `codex/issue-<number>-<slug>`
3. Add `status:in-progress` to the issue
4. Implement only that issue
5. Run the expected validation for the change, with `npm run validate` as the default baseline
6. Open a real PR that links the issue
7. Comment on the issue with the PR link and validation summary
8. Replace `status:in-progress` with `status:has-pr`
9. If blocked, apply `codex:blocked` or `codex:needs-human` and explain why in the issue

## Triage Loop

Run backlog triage on a regular cadence:

1. Review new issues, TODOs, and validation failures
2. Create missing tickets for concrete follow-up work
3. Split oversized `size:L` issues where possible
4. Apply or correct priority, size, and readiness labels
5. Keep only genuinely autonomous work under `codex:ready`

## Helper Script

The repo includes a GitHub CLI helper at [scripts/codex-issues.mjs](/C:/Users/AlexFord/Desktop/GitHub/proc-racer/scripts/codex-issues.mjs).

Examples:

```bash
node scripts/codex-issues.mjs auth
node scripts/codex-issues.mjs labels
node scripts/codex-issues.mjs board
node scripts/codex-issues.mjs pick-next
node scripts/codex-issues.mjs start-next --json
node scripts/codex-issues.mjs finish --issue 123 --validation "npm run validate"
node scripts/codex-issues.mjs block --issue 123 --label codex:needs-human --reason "Needs a product call on race-results density."
node scripts/codex-issues.mjs create --title "Tune AI overtake spacing" --body-file issue.md --label type:bug --label priority:P1 --label size:S --label codex:ready
```

The worker lifecycle commands are:

- `start-next`: select the next `codex:ready` issue, add `status:in-progress`, comment on the issue, and create a `codex/issue-<number>-<slug>` branch from `main`
- `finish`: stage all current changes, commit them, push the branch, open a real PR, replace `status:in-progress` with `status:has-pr`, and comment on the issue with the PR link and validation summary
- `block`: remove `status:in-progress`, mark the issue `codex:blocked` or `codex:needs-human`, and explain why in an issue comment

`start-next` and `finish` are the commands the automation should use for the autonomous worker loop.

## Suggested Codex Automations

Backlog triage prompt:

```text
Review the proc-racer GitHub backlog, TODOs, and recent validation signals. Create missing actionable GitHub issues, split oversized work where useful, and apply the repo's type, priority, size, and Codex readiness labels. Keep anything needing design or product judgment as codex:needs-human.
```

Issue worker prompt:

```text
Inspect the proc-racer GitHub issues. Start by running node scripts/codex-issues.mjs start-next --json. Implement only the claimed issue in the local repo. Validate it appropriately. When the work is complete, run node scripts/codex-issues.mjs finish --issue <number> --validation "<commands run>" and include a concise summary if useful. If the work is blocked, run node scripts/codex-issues.mjs block --issue <number> --label codex:blocked or codex:needs-human --reason "<explanation>".
```
