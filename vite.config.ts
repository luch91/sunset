import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
    // Playwright owns browser suites in e2e/. Keeping them out of Vitest
    // prevents its test globals from being executed by the unit-test runner.
    exclude: ["e2e/**", "**/node_modules/**", "**/dist/**"]
  }
});
