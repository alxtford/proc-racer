import { closeStaticServer, listenStaticServer } from "./static-server.mjs";

const host = process.env.HOST || "127.0.0.1";
const port = Number.parseInt(process.env.PORT || "4173", 10);

const { server, url } = await listenStaticServer({ host, port });

console.log(`Proc Racer running at ${url}`);

async function shutdown(exitCode = 0) {
  await closeStaticServer(server);
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
