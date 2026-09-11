import { describe, expect, test } from "vitest";
import path from "node:path";

// app-content.ts must be safe to import from a "use client" Quest screen, so it (and everything
// it pulls in) must never resolve to a node builtin like node:fs or node:path. esbuild's
// platform: "browser" bundling is a fast, direct check of exactly that: it fails to resolve a
// node builtin instead of silently allowing it. esbuild is a transitive dev dependency here
// (vite/vitest pull it in), not a direct one, so this skips gracefully if it is ever absent.
const esbuild = await import("esbuild").catch(() => null);

describe("app-content browser bundle", () => {
  test.skipIf(!esbuild)("bundles app-content.ts for platform: browser with no node builtins", async () => {
    const result = await esbuild!.build({
      absWorkingDir: path.resolve(__dirname, "..", ".."),
      entryPoints: ["lib/content/app-content.ts"],
      bundle: true,
      write: false,
      platform: "browser",
      format: "esm",
      logLevel: "silent",
      tsconfig: "tsconfig.json",
    });
    expect(result.errors).toEqual([]);
  });
});
