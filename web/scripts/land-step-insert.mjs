#!/usr/bin/env node
// Inserts whole steps into landed quest files (6 September 2026, the data-science thread):
// each entry is { file, afterStepId, step } and the step object is written right after the named
// step, in the file's own indentation, with nothing else in the file touched. Ids are append-only
// like everything else (the new id continues the quest's numbering); only the position is free,
// which is why this exists for seasons nobody has started.
//
//   node scripts/land-step-insert.mjs <inserts.json>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const patchPath = process.argv[2];
if (!patchPath) {
  console.error("usage: node scripts/land-step-insert.mjs <inserts.json>");
  process.exit(2);
}

function matchBrace(text, open) {
  let depth = 0;
  let inString = false;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
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

function indentBody(json, indent) {
  const pad = " ".repeat(indent);
  return json.split("\n").map((line, i) => (i === 0 ? line : pad + line)).join("\n");
}

const entries = JSON.parse(fs.readFileSync(patchPath, "utf8"));
const byFile = new Map();
for (const e of entries) {
  if (!byFile.has(e.file)) byFile.set(e.file, []);
  byFile.get(e.file).push(e);
}

let landed = 0;
for (const [rel, list] of byFile) {
  const file = path.join(REPO_ROOT, rel);
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  let text = crlf ? raw.replace(/\r\n/g, "\n") : raw;
  for (const e of list) {
    if (text.includes(`"id": "${e.step.id}"`)) throw new Error(`${e.step.id} already exists in ${rel}`);
    const [start, end] = locateStep(text, e.afterStepId);
    const lineStart = text.lastIndexOf("\n", start) + 1;
    const indent = start - lineStart;
    const body = indentBody(JSON.stringify(e.step, null, 2), indent);
    text = text.slice(0, end + 1) + ",\n" + " ".repeat(indent) + body + text.slice(end + 1);
    JSON.parse(text);
    landed++;
  }
  fs.writeFileSync(file, crlf ? text.replace(/\n/g, "\r\n") : text);
  console.log(`${rel}: ${list.length} step(s) inserted`);
}
console.log(`done: ${landed} step(s) inserted across ${byFile.size} file(s)`);
