#!/usr/bin/env node
// Lands a quest extras patch: a JSON object keyed by quest file path (repo-relative) whose value
// is that quest's `extras` array. The array is written as the quest object's last field, in the
// file's own indentation, replacing an existing `extras` field if there is one; everything else
// in the file stays byte for byte. Run the validator afterwards; this script does not.
//
//   node scripts/land-extras.mjs <extras.json>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const [patchPath] = process.argv.slice(2);
if (!patchPath) {
  console.error("usage: node scripts/land-extras.mjs <extras.json>");
  process.exit(2);
}

function matchBrace(text, open, openCh, closeCh) {
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
    else if (ch === openCh) depth++;
    else if (ch === closeCh) {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error("unbalanced brackets");
}

const patch = JSON.parse(fs.readFileSync(patchPath, "utf8"));
let landed = 0;
for (const [rel, extras] of Object.entries(patch)) {
  const file = path.join(REPO_ROOT, rel);
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  let text = crlf ? raw.replace(/\r\n/g, "\n") : raw;
  const quest = JSON.parse(text);
  for (const e of extras) if (!e.id.startsWith(`${quest.id}-x`)) throw new Error(`${rel}: extra id ${e.id} does not belong to ${quest.id}`);
  // Drop an existing top-level "extras" field.
  const existing = text.match(/,\n\s*"extras": \[/);
  if (existing) {
    const start = existing.index;
    const open = text.indexOf("[", start);
    const close = matchBrace(text, open, "[", "]");
    text = text.slice(0, start) + text.slice(close + 1);
  }
  const rootClose = text.lastIndexOf("}");
  const lastField = text.slice(0, rootClose).replace(/\s+$/, "");
  const indent = "  ";
  const body = JSON.stringify(extras, null, 2)
    .split("\n")
    .map((line, i) => (i === 0 ? line : indent + line))
    .join("\n");
  text = `${lastField},\n${indent}"extras": ${body}\n}\n`;
  JSON.parse(text);
  fs.writeFileSync(file, crlf ? text.replace(/\n/g, "\r\n") : text);
  landed++;
  console.log(`${rel}: ${extras.length} extra(s) landed`);
}
console.log(`done: ${landed} file(s)`);
