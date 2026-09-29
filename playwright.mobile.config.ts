import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testMatch: "mobile-practice.spec.ts",
  use: { ...base.use, launchOptions: {} },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH
          ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
          : {},
      },
    },
    { name: "webkit", use: { browserName: "webkit", launchOptions: {} } },
  ],
});
