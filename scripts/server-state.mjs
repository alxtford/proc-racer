import fs from "node:fs/promises";
import path from "node:path";

const SERVER_STATE_DIR = path.join(process.cwd(), "output");
const SERVER_STATE_PATH = path.join(SERVER_STATE_DIR, "local-server.json");

export function getServerStatePath() {
  return SERVER_STATE_PATH;
}

export async function readServerState() {
  try {
    const raw = await fs.readFile(SERVER_STATE_PATH, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function writeServerState(state) {
  await fs.mkdir(SERVER_STATE_DIR, { recursive: true });
  await fs.writeFile(
    SERVER_STATE_PATH,
    `${JSON.stringify({ ...state, startedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  );
}

export async function removeServerState() {
  await fs.rm(SERVER_STATE_PATH, { force: true });
}

export function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") {
      return false;
    }
    throw error;
  }
}

export async function waitForProcessExit(pid, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return !isProcessAlive(pid);
}
