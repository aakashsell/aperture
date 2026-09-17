import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  workers: 1,
  use: {
    baseURL: process.env.WEB_URL || "http://127.0.0.1:53009",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run start -- --port 53009 --hostname 127.0.0.1",
    url: "http://127.0.0.1:53009",
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
