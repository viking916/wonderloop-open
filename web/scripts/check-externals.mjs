#!/usr/bin/env node
// After `next build`: Turbopack (Next 16) externalises firebase-admin under a hashed alias,
// `<package>-<hash>`, and satisfies it locally with a symlink inside .next/node_modules. The hash
// is derived from the package's absolute path, so it differs between this machine, a container
// and any other checkout, and the symlink does not survive an upload to Cloud Run: every
// /api/ai route answered 500 with "Cannot find package 'firebase-admin-a14c8a5423a75469'" on
// 6 September 2026.
//
// Two deployment shapes, two remedies:
// - Firebase Hosting uploads the build and installs from package.json on Cloud Run, so the alias
//   must be declared there as an npm alias dependency ("<alias>": "npm:firebase-admin@..."). This
//   script fails the build if the alias this machine produces is not declared.
// - A standalone build (NEXT_OUTPUT=standalone, the Dockerfile) ships its own traced node_modules,
//   so it is enough that the alias exists as a real directory under node_modules before the
//   tracer runs. This script materialises it as a copy of the real package.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, ".next", "node_modules");
if (!fs.existsSync(dir)) {
  console.log("check-externals: no hashed externals in this build.");
  process.exit(0);
}
const standalone = process.env.NEXT_OUTPUT === "standalone";
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const deps = { ...(pkg.dependencies ?? {}) };
const aliases = fs.readdirSync(dir);
const missing = [];
for (const alias of aliases) {
  const real = alias.replace(/-[0-9a-f]{16}$/, "");
  const target = path.join(root, "node_modules", alias);
  if (!fs.existsSync(target)) {
    // Materialise the alias as a real copy, so Node resolves it here and a standalone tracer
    // carries it along. (cp, not a link: links are what fail to travel.)
    fs.cpSync(path.join(root, "node_modules", real), target, { recursive: true });
    console.log(`check-externals: materialised node_modules/${alias} from ${real}.`);
  }
  if (!(alias in deps)) missing.push(alias);
}
if (missing.length && !standalone) {
  console.error(
    `check-externals: Turbopack linked ${missing.join(", ")} under .next/node_modules but package.json does not declare ` +
      `${missing.length === 1 ? "it" : "them"}. Add, for each, "<alias>": "npm:<real package>@<version>" to dependencies and run npm install, ` +
      "or the deployed Firebase function will fail to load these modules (see docs/deploy-runbook.md).",
  );
  process.exit(1);
}
console.log(`check-externals: ${aliases.length} hashed external(s): ${aliases.join(", ")}${standalone ? " (standalone build, carried in the traced node_modules)" : ", all declared in package.json"}.`);
