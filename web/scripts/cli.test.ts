import { describe, expect, test } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";

const webRoot = path.join(__dirname, "..");
const tsx = path.join(webRoot, "node_modules", "tsx", "dist", "cli.mjs");
const fixture = (name: string) => path.join(webRoot, "lib", "content", "__fixtures__", name);

function run(script: string, args: string[]) {
  return spawnSync(process.execPath, [tsx, path.join(webRoot, "scripts", script), ...args], { cwd: webRoot, encoding: "utf8" });
}

describe("validate-content cli", () => {
  test("exits 0 and prints content ok for the good fixture", { timeout: 60000 }, () => {
    const r = run("validate-content.ts", [fixture("good"), "--partial"]);
    expect(r.stdout).toMatch(/content ok:/);
    expect(r.status).toBe(0);
  });

  test("exits 1 and names the errors for the bad fixture", { timeout: 60000 }, () => {
    const r = run("validate-content.ts", [fixture("bad"), "--partial"]);
    expect(r.stderr).toMatch(/unknown idea "nope"/);
    expect(r.stderr).toMatch(/content error/);
    expect(r.status).toBe(1);
  });
});

describe("content-report cli", () => {
  test("exits 0 with no smells for the good fixture", { timeout: 60000 }, () => {
    const r = run("content-report.ts", [fixture("good")]);
    expect(r.stdout).toMatch(/smells: 0/);
    expect(r.status).toBe(0);
  });

  test("exits 1 when a hint leaks the answer", { timeout: 60000 }, () => {
    const r = run("content-report.ts", [fixture("leak")]);
    expect(r.stdout).toMatch(/hint-leaks-answer/);
    expect(r.status).toBe(1);
  });
});
