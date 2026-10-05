import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: "http://localhost:3100",
    ...devices["Pixel 7"],
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined },
  },
  webServer: {
    command: "npx next start -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: true,
    env: { AUTH_URL: "http://localhost:3100", AUTH_TRUST_HOST: "true" },
  },
});
