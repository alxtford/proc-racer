import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const PRIORITY_ORDER = ["priority:P0", "priority:P1", "priority:P2", "priority:P3"];
const SIZE_ORDER = ["size:S", "size:M", "size:L"];
const READY_LABEL = "codex:ready";
const NEEDS_HUMAN_LABEL = "codex:needs-human";
const BLOCKED_LABEL = "codex:blocked";
const IN_PROGRESS_LABEL = "status:in-progress";
const HAS_PR_LABEL = "status:has-pr";
const DEFAULT_BASE_BRANCH = "main";
const REQUIRED_LABELS = [
  { name: "type:bug", color: "d73a4a", description: "Broken gameplay, UI, or validation behavior." },
  { name: "type:feature", color: "1d76db", description: "New player-facing or system capability." },
  { name: "type:polish", color: "5319e7", description: "Readability, feel, or presentation improvement." },
  { name: "type:chore", color: "6f42c1", description: "Repo, tooling, docs, or maintenance work." },
  { name: "priority:P0", color: "b60205", description: "Critical: broken core race flow, saves, or severe regressions." },
  { name: "priority:P1", color: "d93f0b", description: "High: major readability, fairness, or UX problems." },
  { name: "priority:P2", color: "fbca04", description: "Medium: meaningful follow-up work or polish." },
  { name: "priority:P3", color: "0e8a16", description: "Low: nice-to-have ideas and backlog tail." },
  { name: "size:S", color: "c2e0c6", description: "Small scoped change." },
  { name: "size:M", color: "bfdadc", description: "Medium scoped change." },
  { name: "size:L", color: "fef2c0", description: "Large issue that likely needs splitting." },
  { name: READY_LABEL, color: "0e8a16", description: "Safe for Codex to implement autonomously." },
  { name: NEEDS_HUMAN_LABEL, color: "d4c5f9", description: "Needs design, product, or other human input first." },
  { name: BLOCKED_LABEL, color: "000000", description: "Cannot proceed until another dependency clears." },
  { name: IN_PROGRESS_LABEL, color: "fbca04", description: "Currently being worked." },
  { name: HAS_PR_LABEL, color: "1d76db", description: "Implementation PR is open for this issue." },
];

function printUsage() {
  console.log(`Usage:
  node scripts/codex-issues.mjs auth [--repo owner/name]
  node scripts/codex-issues.mjs labels [--repo owner/name]
  node scripts/codex-issues.mjs board [--repo owner/name] [--json]
  node scripts/codex-issues.mjs pick-next [--repo owner/name] [--json]
  node scripts/codex-issues.mjs create --title "..." [--body-file path | --body "..."] [--label name ...] [--repo owner/name]
  node scripts/codex-issues.mjs start-next [--repo owner/name] [--base main] [--json]
  node scripts/codex-issues.mjs start --issue 123 [--repo owner/name] [--base main] [--json]
  node scripts/codex-issues.mjs finish --issue 123 --validation "npm run validate" [--summary "..." | --summary-file path] [--commit-message "..."] [--pr-title "..."] [--repo owner/name] [--json]
  node scripts/codex-issues.mjs block --issue 123 --reason "..." [--label codex:blocked|codex:needs-human] [--repo owner/name]

Commands:
  auth       Verify that GitHub CLI authentication is available.
  labels     Ensure the repo has the required issue labels.
  board      Print open issues in Codex priority order.
  pick-next  Print the highest priority Codex-ready issue.
  create     Create a new GitHub issue with the supplied title/body/labels.
  start-next Claim the next Codex-ready issue, mark it in progress, and create a branch.
  start      Claim a specific issue, mark it in progress, and create a branch.
  finish     Commit current work, push the branch, open a real PR, and update the issue.
  block      Remove in-progress state and mark an issue blocked or human-needed.
`);
}

function parseArgs(argv) {
  const parsed = {
    flags: new Set(),
    values: new Map(),
    lists: new Map(),
    positionals: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      parsed.positionals.push(token);
      continue;
    }

    const key = token.slice(2);
    if (key === "json") {
      parsed.flags.add(key);
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }

    index += 1;
    if (key === "label") {
      const labels = parsed.lists.get(key) ?? [];
      labels.push(next);
      parsed.lists.set(key, labels);
      continue;
    }

    parsed.values.set(key, next);
  }

  return parsed;
}

function getRepoArgs(parsed) {
  const repo = parsed.values.get("repo");
  return repo ? ["--repo", repo] : [];
}

function labelNames(issue) {
  return new Set((issue.labels ?? []).map((label) => label.name));
}

function priorityRank(issue) {
  const labels = labelNames(issue);
  const index = PRIORITY_ORDER.findIndex((label) => labels.has(label));
  return index === -1 ? PRIORITY_ORDER.length : index;
}

function sizeRank(issue) {
  const labels = labelNames(issue);
  const index = SIZE_ORDER.findIndex((label) => labels.has(label));
  return index === -1 ? SIZE_ORDER.length : index;
}

function isCodexReady(issue) {
  const labels = labelNames(issue);
  return labels.has(READY_LABEL)
    && !labels.has(NEEDS_HUMAN_LABEL)
    && !labels.has(BLOCKED_LABEL)
    && !labels.has(IN_PROGRESS_LABEL)
    && !labels.has(HAS_PR_LABEL);
}

function compareIssues(left, right) {
  const priorityDelta = priorityRank(left) - priorityRank(right);
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const sizeDelta = sizeRank(left) - sizeRank(right);
  if (sizeDelta !== 0) {
    return sizeDelta;
  }

  return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    || "issue";
}

function branchNameForIssue(issue) {
  return `codex/issue-${issue.number}-${slugify(issue.title)}`;
}

function prTitleForIssue(issue, parsed) {
  return parsed.values.get("pr-title") ?? `[codex] #${issue.number} ${issue.title}`;
}

function commitMessageForIssue(issue, parsed) {
  return parsed.values.get("commit-message") ?? `issue-${issue.number}: ${issue.title}`;
}

function renderSummaryText(parsed) {
  const inline = parsed.values.get("summary");
  const file = parsed.values.get("summary-file");

  if (inline && file) {
    throw new Error("Use either --summary or --summary-file, not both.");
  }

  if (file) {
    return readFile(file, "utf8");
  }

  return Promise.resolve(inline ?? "");
}

function ensureLabelChoice(value) {
  if (!value) {
    return BLOCKED_LABEL;
  }
  if (value !== BLOCKED_LABEL && value !== NEEDS_HUMAN_LABEL) {
    throw new Error(`--label must be ${BLOCKED_LABEL} or ${NEEDS_HUMAN_LABEL}`);
  }
  return value;
}

function jsonOut(parsed, data) {
  if (parsed.flags.has("json")) {
    console.log(JSON.stringify(data, null, 2));
    return true;
  }
  return false;
}

function trimTrailing(value) {
  return value.trim().replace(/\r\n/g, "\n");
}

function splitLines(value) {
  return trimTrailing(value).split("\n").filter(Boolean);
}

function gh(args, { captureStdout = true } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("gh", args, {
      cwd: process.cwd(),
      stdio: captureStdout ? ["ignore", "pipe", "pipe"] : "inherit",
    });

    let stdout = "";
    let stderr = "";

    if (captureStdout) {
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
    }

    child.on("error", (error) => {
      if (error.code === "ENOENT") {
        reject(new Error("GitHub CLI `gh` is required but was not found in PATH."));
        return;
      }
      reject(error);
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(stderr.trim() || `gh ${args.join(" ")} exited with code ${code}`));
    });
  });
}

function git(args, { captureStdout = true } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: process.cwd(),
      stdio: captureStdout ? ["ignore", "pipe", "pipe"] : "inherit",
    });

    let stdout = "";
    let stderr = "";

    if (captureStdout) {
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
    }

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(stderr.trim() || `git ${args.join(" ")} exited with code ${code}`));
    });
  });
}

async function ensureAuth() {
  await gh(["auth", "status"], { captureStdout: false });
}

async function fetchOpenIssues(parsed) {
  const { stdout } = await gh([
    "issue",
    "list",
    "--state",
    "open",
    "--limit",
    "200",
    "--json",
    "number,title,url,labels,createdAt,updatedAt,comments",
    ...getRepoArgs(parsed),
  ]);
  return JSON.parse(stdout);
}

async function fetchIssue(parsed, issueNumber) {
  const { stdout } = await gh([
    "issue",
    "view",
    String(issueNumber),
    "--json",
    "number,title,url,labels,createdAt,updatedAt,body,comments",
    ...getRepoArgs(parsed),
  ]);
  return JSON.parse(stdout);
}

function commentPreview(comment) {
  return trimTrailing(comment.body ?? "").split("\n")[0] ?? "";
}

function issueContext(issue) {
  return {
    body: issue.body ?? "",
    comments: (issue.comments ?? []).map((comment) => ({
      url: comment.url,
      author: comment.author?.login ?? "unknown",
      createdAt: comment.createdAt,
      body: comment.body ?? "",
      preview: commentPreview(comment),
    })),
  };
}

async function ensureCleanWorktree() {
  const { stdout } = await git(["status", "--porcelain"]);
  if (trimTrailing(stdout)) {
    throw new Error("Working tree is not clean. Commit, stash, or move unrelated changes before starting an issue.");
  }
}

async function currentBranch() {
  const { stdout } = await git(["branch", "--show-current"]);
  return trimTrailing(stdout);
}

async function ensureOnExpectedBranch(baseBranch) {
  const branch = await currentBranch();
  if (branch !== baseBranch) {
    throw new Error(`Expected to be on ${baseBranch} before starting work, but found ${branch}.`);
  }
}

async function addIssueLabels(parsed, issueNumber, labels) {
  if (!labels.length) {
    return;
  }

  const args = ["issue", "edit", String(issueNumber), ...getRepoArgs(parsed)];
  for (const label of labels) {
    args.push("--add-label", label);
  }
  await gh(args);
}

async function removeIssueLabels(parsed, issueNumber, labels) {
  if (!labels.length) {
    return;
  }

  const args = ["issue", "edit", String(issueNumber), ...getRepoArgs(parsed)];
  for (const label of labels) {
    args.push("--remove-label", label);
  }
  await gh(args);
}

async function commentOnIssue(parsed, issueNumber, body) {
  await gh([
    "issue",
    "comment",
    String(issueNumber),
    "--body",
    body,
    ...getRepoArgs(parsed),
  ]);
}

async function createBranchForIssue(issue, parsed) {
  const baseBranch = parsed.values.get("base") ?? DEFAULT_BASE_BRANCH;
  await ensureCleanWorktree();
  await ensureOnExpectedBranch(baseBranch);
  await git(["checkout", "-b", branchNameForIssue(issue)]);
  return branchNameForIssue(issue);
}

async function selectIssueForStart(parsed) {
  const requestedIssue = parsed.values.get("issue");
  if (requestedIssue) {
    const issue = await fetchIssue(parsed, requestedIssue);
    if (!isCodexReady(issue)) {
      throw new Error(`Issue #${issue.number} is not Codex-ready.`);
    }
    return issue;
  }

  const issues = await fetchOpenIssues(parsed);
  const nextIssue = issues.filter(isCodexReady).sort(compareIssues)[0];
  if (!nextIssue) {
    throw new Error("No Codex-ready issue found.");
  }
  return fetchIssue(parsed, nextIssue.number);
}

function renderStartComment(issue, branchName) {
  return [
    `Codex claimed this issue for implementation.`,
    ``,
    `- Branch: \`${branchName}\``,
    `- Source issue: #${issue.number}`,
    ``,
    `This issue is now marked \`${IN_PROGRESS_LABEL}\` until the PR is opened or the work is blocked.`,
  ].join("\n");
}

function renderPrBody(issue, validationText, summaryText) {
  const summaryLines = splitLines(summaryText);
  const validationLines = splitLines(validationText);

  return [
    "## Summary",
    "",
    ...(summaryLines.length ? summaryLines.map((line) => `- ${line}`) : ["- Implemented the scoped issue work."]),
    "",
    "## Linked Issue",
    "",
    `- Closes #${issue.number}`,
    "",
    "## Product / Repo Value",
    "",
    "- Resolves the tracked issue scope without bundling unrelated work.",
    "",
    "## Validation",
    "",
    ...validationLines.map((line) => `- ${line}`),
    "",
    "## Notes",
    "",
    "- Opened automatically by the Codex issue worker.",
  ].join("\n");
}

function renderFinishComment(prUrl, validationText) {
  const validationLines = splitLines(validationText);
  return [
    `Implementation PR opened: ${prUrl}`,
    ``,
    `Validation run:`,
    ...validationLines.map((line) => `- ${line}`),
  ].join("\n");
}

function renderBlockComment(reason, label) {
  return [
    `Codex could not complete this issue autonomously.`,
    ``,
    `Outcome: \`${label}\``,
    ``,
    reason,
  ].join("\n");
}

async function withTempFile(contents, callback) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "codex-issues-"));
  const tempFile = path.join(tempDir, "body.md");

  try {
    await writeFile(tempFile, contents, "utf8");
    return await callback(tempFile);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function authCommand(parsed) {
  await ensureAuth();
  if (!jsonOut(parsed, { ok: true })) {
    console.log("GitHub CLI authentication is available.");
  }
}

function printBoard(issues) {
  if (!issues.length) {
    console.log("No open issues found.");
    return;
  }

  for (const issue of issues) {
    const labels = [...labelNames(issue)].sort().join(", ");
    console.log(`#${issue.number} ${issue.title}`);
    console.log(`  ${issue.url}`);
    console.log(`  ${labels}`);
    console.log(`  comments: ${(issue.comments ?? []).length}`);
  }
}

async function ensureLabels(parsed) {
  await ensureAuth();

  const { stdout } = await gh([
    "label",
    "list",
    "--limit",
    "200",
    "--json",
    "name",
    ...getRepoArgs(parsed),
  ]);
  const existing = new Set(JSON.parse(stdout).map((label) => label.name));

  const missing = REQUIRED_LABELS.filter((label) => !existing.has(label.name));
  if (!missing.length) {
    console.log("All required labels already exist.");
    return;
  }

  for (const label of missing) {
    await gh([
      "label",
      "create",
      label.name,
      "--color",
      label.color,
      "--description",
      label.description,
      ...getRepoArgs(parsed),
    ]);
    console.log(`Created label ${label.name}`);
  }
}

async function createIssue(parsed) {
  await ensureAuth();

  const title = parsed.values.get("title");
  if (!title) {
    throw new Error("create requires --title");
  }

  const inlineBody = parsed.values.get("body");
  const bodyFile = parsed.values.get("body-file");
  if (inlineBody && bodyFile) {
    throw new Error("Use either --body or --body-file, not both.");
  }

  let body = inlineBody ?? "";
  if (bodyFile) {
    body = await readFile(bodyFile, "utf8");
  }

  const labels = parsed.lists.get("label") ?? [];
  if (!labels.length) {
    labels.push("type:chore", "priority:P2", "size:S", NEEDS_HUMAN_LABEL);
  }

  const args = [
    "issue",
    "create",
    "--title",
    title,
    "--body",
    body,
    ...getRepoArgs(parsed),
  ];

  for (const label of labels) {
    args.push("--label", label);
  }

  const { stdout } = await gh(args);
  console.log(stdout.trim());
}

async function showBoard(parsed) {
  await ensureAuth();

  const issues = await fetchOpenIssues(parsed);
  const ordered = [...issues].sort(compareIssues);

  if (!jsonOut(parsed, ordered)) {
    printBoard(ordered);
  }
}

async function pickNext(parsed) {
  await ensureAuth();

  const issues = await fetchOpenIssues(parsed);
  const nextIssue = issues.filter(isCodexReady).sort(compareIssues)[0];

  if (!nextIssue) {
    console.error("No Codex-ready issue found.");
    process.exitCode = 1;
    return;
  }

  if (!jsonOut(parsed, nextIssue)) {
    console.log(`#${nextIssue.number} ${nextIssue.title}`);
    console.log(nextIssue.url);
    console.log(`Comments: ${(nextIssue.comments ?? []).length}`);
    console.log("Before implementation, read the issue body and all issue comments for the latest product direction.");
  }
}

async function startIssue(parsed) {
  await ensureAuth();

  const issue = await selectIssueForStart(parsed);
  const branchName = await createBranchForIssue(issue, parsed);

  await addIssueLabels(parsed, issue.number, [IN_PROGRESS_LABEL]);
  await commentOnIssue(parsed, issue.number, renderStartComment(issue, branchName));

  const result = {
    issue: {
      number: issue.number,
      title: issue.title,
      url: issue.url,
      context: issueContext(issue),
    },
    branch: branchName,
  };

  if (!jsonOut(parsed, result)) {
    console.log(`#${issue.number} ${issue.title}`);
    console.log(issue.url);
    console.log(branchName);
    console.log("Read the issue body and comments before implementing so comment-level decisions override stale issue text.");
  }
}

async function finishIssue(parsed) {
  await ensureAuth();

  const issueNumber = parsed.values.get("issue");
  if (!issueNumber) {
    throw new Error("finish requires --issue");
  }

  const validationText = parsed.values.get("validation");
  if (!validationText) {
    throw new Error("finish requires --validation");
  }

  const issue = await fetchIssue(parsed, issueNumber);
  const branch = await currentBranch();
  if (!branch || branch === DEFAULT_BASE_BRANCH) {
    throw new Error("finish must run from a dedicated issue branch, not main.");
  }

  const { stdout: statusBefore } = await git(["status", "--porcelain"]);
  if (!trimTrailing(statusBefore)) {
    throw new Error("No local changes to commit.");
  }

  await git(["add", "-A"]);
  await git(["commit", "-m", commitMessageForIssue(issue, parsed)], { captureStdout: false });
  await git(["push", "-u", "origin", branch], { captureStdout: false });

  const summaryText = await renderSummaryText(parsed);
  const prBody = renderPrBody(issue, validationText, summaryText);
  const prTitle = prTitleForIssue(issue, parsed);

  const prUrl = await withTempFile(prBody, async (bodyPath) => {
    const { stdout } = await gh([
      "pr",
      "create",
      "--title",
      prTitle,
      "--body-file",
      bodyPath,
      "--head",
      branch,
      ...getRepoArgs(parsed),
    ]);
    return trimTrailing(stdout);
  });

  await removeIssueLabels(parsed, issue.number, [IN_PROGRESS_LABEL]);
  await addIssueLabels(parsed, issue.number, [HAS_PR_LABEL]);
  await commentOnIssue(parsed, issue.number, renderFinishComment(prUrl, validationText));

  const result = {
    issue: issue.number,
    branch,
    prUrl,
  };

  if (!jsonOut(parsed, result)) {
    console.log(prUrl);
  }
}

async function blockIssue(parsed) {
  await ensureAuth();

  const issueNumber = parsed.values.get("issue");
  const reason = parsed.values.get("reason");
  if (!issueNumber) {
    throw new Error("block requires --issue");
  }
  if (!reason) {
    throw new Error("block requires --reason");
  }

  const label = ensureLabelChoice(parsed.values.get("label"));
  await removeIssueLabels(parsed, issueNumber, [IN_PROGRESS_LABEL]);
  await addIssueLabels(parsed, issueNumber, [label]);
  await commentOnIssue(parsed, issueNumber, renderBlockComment(reason, label));

  console.log(`Issue #${issueNumber} marked ${label}`);
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const [command] = parsed.positionals;

  switch (command) {
    case "auth":
      await authCommand(parsed);
      break;
    case "labels":
      await ensureLabels(parsed);
      break;
    case "board":
      await showBoard(parsed);
      break;
    case "pick-next":
      await pickNext(parsed);
      break;
    case "create":
      await createIssue(parsed);
      break;
    case "start-next":
      await startIssue(parsed);
      break;
    case "start":
      await startIssue(parsed);
      break;
    case "finish":
      await finishIssue(parsed);
      break;
    case "block":
      await blockIssue(parsed);
      break;
    case undefined:
    case "help":
    case "--help":
      printUsage();
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
