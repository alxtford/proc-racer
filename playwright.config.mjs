import { defineConfig } from "playwright/test";

const baseURL = process.env.PROC_RACER_BASE_URL || "http://127.0.0.1:4173";

export default defineConfig({
  testDir: "./tests/playwright",
  testMatch: "*.spec.mjs",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  reporter: [["line"]],
  outputDir: "output/playwright-artifacts",
  use: {
    baseURL,
    browserName: "chromium",
    headless: true,
    viewport: { width: 1280, height: 720 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  webServer: process.env.PROC_RACER_BASE_URL
    ? undefined
    : {
        command: "node scripts/serve.mjs",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 30_000,
      },
});
