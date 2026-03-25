import { closeStaticServer, listenStaticServer } from "./static-server.mjs";
import {
  isProcessAlive,
  readServerState,
  removeServerState,
  writeServerState,
} from "./server-state.mjs";

const host = process.env.HOST || "127.0.0.1";
const port = Number.parseInt(process.env.PORT || "4173", 10);

const existingState = await readServerState();

if (existingState) {
  if (isProcessAlive(existingState.pid)) {
    throw new Error(
      `SHARDLINE server already running at ${existingState.url || `http://${existingState.host || host}:${existingState.port || port}`}. Run npm stop first.`,
    );
  }
  await removeServerState();
}

const { server, url } = await listenStaticServer({ host, port });
await writeServerState({
  host,
  pid: process.pid,
  port,
  url,
});

console.log(`SHARDLINE running at ${url}`);

let shuttingDown = false;

async function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  await closeStaticServer(server);
  await removeServerState();
  process.exit(exitCode);
}

process.on("SIGINT", () => {
  shutdown(0).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
});

process.on("SIGTERM", () => {
  shutdown(0).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
});
