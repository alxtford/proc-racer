import path from "node:path";
import { spawn } from "node:child_process";

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

function runCommand(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    const isWindowsNpx = process.platform === "win32" && command === "npx";
    const child = isWindowsNpx
      ? spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npx", ...args], {
          cwd: rootDir,
          env: { ...process.env, ...env },
          stdio: "inherit",
        })
      : spawn(command, args, {
          cwd: rootDir,
          env: { ...process.env, ...env },
          stdio: "inherit",
        });
    const displayCommand = isWindowsNpx
      ? ["npx", ...args].join(" ")
      : `${command} ${args.join(" ")}`;

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${displayCommand} exited with code ${code}`));
    });

    child.on("error", reject);
  });
}

async function main() {
  await runNodeScript(path.join("scripts", "validate-content.mjs"));
  await runNodeScript(path.join("scripts", "run-unit-tests.mjs"));
  await runCommand("npx", ["playwright", "test"]);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
