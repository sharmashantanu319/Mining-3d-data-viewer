import { defineConfig } from "vitest/config";

// Lightweight setup: pure-function unit tests only, Node environment, no jsdom
// and no React Testing Library yet (see the point-sizing notes for the
// separate real-browser WebGL smoke test). Add a jsdom project later if/when
// component tests are introduced.
export default defineConfig({
  test: {
    environment: "node",
    include: ["app/**/__tests__/**/*.test.{js,mjs}"],
  },
});
