import { readdirSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const rootDir = process.cwd();
const unitsDir = path.join(rootDir, "tests", "units");

function collectTestFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectTestFiles(fullPath);
    if (!entry.isFile() || !entry.name.endsWith(".test.mjs")) return [];
    return [path.relative(rootDir, fullPath)];
  });
}

function runNodeTests(testFiles, coverage = false) {
  return new Promise((resolve, reject) => {
    const args = ["--test"];
    if (coverage) args.push("--experimental-test-coverage");
    args.push(...testFiles);

    const child = spawn(process.execPath, args, {
      cwd: rootDir,
      env: process.env,
      stdio: "inherit",
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${process.execPath} ${args.join(" ")} exited with code ${code}`));
    });

    child.on("error", reject);
  });
}

async function main() {
  const coverage = process.argv.includes("--coverage");
  const testFiles = collectTestFiles(unitsDir).sort();
  if (!testFiles.length) {
    throw new Error(`No unit test files found in ${unitsDir}`);
  }
  await runNodeTests(testFiles, coverage);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
