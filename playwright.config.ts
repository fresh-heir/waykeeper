import { defineConfig, devices } from "@playwright/test";

const playwrightBaseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const shouldSkipWebServer = Boolean(process.env.PLAYWRIGHT_SKIP_WEBSERVER);
const runHeadless = process.env.CI ? true : !process.env.PLAYWRIGHT_HEADED;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: playwrightBaseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: shouldSkipWebServer
    ? undefined
    : {
        command: process.env.PLAYWRIGHT_REAL_AI
          ? "NEXT_PUBLIC_WAYKEEPER_SHOW_DEV_TOOLS=1 NEXT_PUBLIC_WAYKEEPER_SKIP_WELCOME=1 NEXT_PUBLIC_WAYKEEPER_FORCE_AI_DIAGNOSTICS=1 npm run qa:server"
          : "NEXT_PUBLIC_WAYKEEPER_SHOW_DEV_TOOLS=1 NEXT_PUBLIC_WAYKEEPER_SKIP_WELCOME=1 npm run qa:server",
        url: playwrightBaseURL,
        reuseExistingServer: !process.env.CI,
        stdout: "pipe",
        stderr: "pipe",
      },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        headless: runHeadless,
      },
    },
  ],
});
