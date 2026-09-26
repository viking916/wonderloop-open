#!/usr/bin/env node
// Replaces the whole `figure` object of existing steps in the hand-formatted quest files, the one
// edit land-step-patch.mjs cannot make (it patches one-line fields and checklists only). Each entry
// is { file, stepId, replaces: <the current figure>, figure: <the new figure> }; the current figure
// must match `replaces` exactly, so a stale patch cannot overwrite anything. The new figure is
// written in the file's own two-space layout at the step's indentation; nothing else is touched.
// Put this file in web/scripts/ (it resolves the repo root from there, like its siblings).
//   node scripts/land-figure-patch.mjs <figures.json>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const patchPath = process.argv[2];
if (!patchPath) { console.error("usage: node scripts/land-figure-patch.mjs <figures.json>"); process.exit(2); }

function matchBrace(text, open) {
  let depth = 0, inString = false;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (inString) { if (ch === "\\") i++; else if (ch === '"') inString = false; continue; }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) return i; }
  }
  throw new Error("unbalanced braces");
}
function locateStep(text, stepId) {
  const needle = `"id": "${stepId}"`;
  const at = text.indexOf(needle);
  if (at < 0) throw new Error(`step id not found: ${stepId}`);
  if (text.indexOf(needle, at + 1) >= 0) throw new Error(`step id not unique: ${stepId}`);
  const open = text.lastIndexOf("{", at);
  return [open, matchBrace(text, open)];
}

const entries = JSON.parse(fs.readFileSync(patchPath, "utf8"));
const byFile = new Map();
for (const e of entries) { if (!byFile.has(e.file)) byFile.set(e.file, []); byFile.get(e.file).push(e); }
let landed = 0;
for (const [rel, list] of byFile) {
  const file = path.join(REPO_ROOT, rel);
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  let text = crlf ? raw.replace(/\r\n/g, "\n") : raw;
  for (const e of list) {
    const [start, end] = locateStep(text, e.stepId);
    const stepText = text.slice(start, end + 1);
    const step = JSON.parse(stepText);
    if (JSON.stringify(step.figure) !== JSON.stringify(e.replaces)) throw new Error(`${e.stepId}: figure differs from replaces`);
    // The step's own "figure" key: the last one at the step's first nesting level.
    const lineStart = text.lastIndexOf("\n", start) + 1;
    const stepIndent = start - lineStart;
    const keyIndent = " ".repeat(stepIndent + 2);
    const key = `\n${keyIndent}"figure": {`;
    const k = stepText.indexOf(key);
    if (k < 0 || stepText.indexOf(key, k + 1) >= 0) throw new Error(`${e.stepId}: figure key not found once`);
    const open = k + key.length - 1;
    const close = matchBrace(stepText, open);
    const body = JSON.stringify(e.figure, null, 2).split("\n").map((l, i) => (i === 0 ? l : keyIndent + l)).join("\n");
    const next = stepText.slice(0, open) + body + stepText.slice(close + 1);
    if (JSON.stringify(JSON.parse(next).figure) !== JSON.stringify(e.figure)) throw new Error(`${e.stepId}: figure did not land`);
    text = text.slice(0, start) + next + text.slice(end + 1);
    landed++;
  }
  JSON.parse(text);
  fs.writeFileSync(file, crlf ? text.replace(/\n/g, "\r\n") : text);
  console.log(`${rel}: ${list.length} figure(s) replaced`);
}
console.log(`done: ${landed} figure(s) replaced across ${byFile.size} file(s)`);
