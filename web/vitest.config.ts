import { defineConfig, configDefaults } from "vitest/config";
import path from "node:path";

// The default suite (npm test): pure unit tests only. scripts/rules.test.ts and any other
// emulator-backed test is excluded here (not just "not included" -- an explicit exclude,
// because Vitest's CLI file filter can only narrow an already-discovered file set, never
// re-include something exclude ruled out) so `npm test` never needs the Firebase emulators and
// never fails with ECONNREFUSED for someone who does not have them running. Emulator-backed
// tests live in vitest.emulator.config.ts, run via `npm run test:rules`.
export default defineConfig({
  test: {
    // Default environment stays "node" for the pure logic tests above; component tests (task 10
    // regression test for the ProblemPlayer soft-lock) opt into jsdom per-file via a
    // `// @vitest-environment jsdom` comment at the top of the test file, so this default -- and
    // every existing test's zero-DOM assumption -- is unchanged.
    environment: "node",
    include: ["lib/**/*.test.ts", "scripts/**/*.test.ts", "components/**/*.test.tsx"],
    exclude: [...configDefaults.exclude, "scripts/rules.test.ts", "scripts/storage-rules.test.ts"],
  },
  resolve: { alias: { "@": path.resolve(__dirname) } },
});
