import {
  isProcessAlive,
  readServerState,
  removeServerState,
  waitForProcessExit,
} from "./server-state.mjs";

const state = await readServerState();

if (!state) {
  console.log("No running SHARDLINE server found.");
  process.exit(0);
}

if (!isProcessAlive(state.pid)) {
  await removeServerState();
  console.log("Cleared stale SHARDLINE server state.");
  process.exit(0);
}

process.kill(state.pid, "SIGTERM");

const exited = await waitForProcessExit(state.pid);

if (!exited) {
  throw new Error(`Timed out waiting for SHARDLINE server process ${state.pid} to exit.`);
}

await removeServerState();
console.log(`Stopped SHARDLINE server at ${state.url || `http://${state.host || "127.0.0.1"}:${state.port || "4173"}`}.`);
