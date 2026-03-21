import path from "node:path";
import { spawn } from "node:child_process";
import { closeStaticServer, listenStaticServer } from "./static-server.mjs";

const rootDir = process.cwd();

function runNodeScript(scriptPath, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: rootDir,
      env: { ...process.env, ...env },
      stdio: "inherit",
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${path.basename(scriptPath)} exited with code ${code}`));
    });

    child.on("error", reject);
  });
}

async function main() {
  const { server, url } = await listenStaticServer({ rootDir, port: 0 });

  try {
    await runNodeScript(path.join("scripts", "validate-content.mjs"));
    await runNodeScript(path.join("scripts", "check-garage-loop.mjs"), {
      PROC_RACER_BASE_URL: url,
    });
  } finally {
    await closeStaticServer(server);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
