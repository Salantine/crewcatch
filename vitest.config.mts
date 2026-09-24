import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      // import.meta.dirname (not __dirname) — this config is ESM (.mts).
      "@": `${import.meta.dirname}/src`,
    },
  },
});
