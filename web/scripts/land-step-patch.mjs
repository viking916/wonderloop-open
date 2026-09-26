#!/usr/bin/env node
// Lands step-level edits produced by a content author (a new body, title, checklist or explain
// problemId on an existing step) into the hand-formatted quest files without reformatting
// anything around them.
//
// The patch is a JSON array of { file, stepId, replaces: { field: oldValue, ... }, field: newValue,
// ... }. For each entry the script finds the step object carrying `"id": "<stepId>"`, confirms
// every field named in `replaces` currently holds that value (so a stale patch cannot overwrite
// the wrong text), then rewrites just those fields inside the step's own text range: scalar
// fields as one `"field": <json>` line, checklists as the whole array. Everything else in the file
// is left byte for byte as it was. Run the validator afterwards; this script does not.
//
//   node scripts/land-step-patch.mjs <steps.json>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const [patchPath] = process.argv.slice(2);
if (!patchPath) {
  console.error("usage: node scripts/land-step-patch.mjs <steps.json>");
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

/** Replaces one top-level field of the step (not one nested inside its problems). */
function replaceField(stepText, field, oldValue, newValue) {
  const oldJson = JSON.stringify(oldValue);
  const newJson = JSON.stringify(newValue);
  if (Array.isArray(oldValue)) {
    // Checklists are laid out one item per line in these files; match the array as a block.
    const re = new RegExp(`"${field}": \\[[\\s\\S]*?\\]`);
    const m = stepText.match(re);
    if (!m) throw new Error(`array field ${field} not found`);
    const current = JSON.parse(m[0].slice(m[0].indexOf("[")));
    if (JSON.stringify(current) !== oldJson) throw new Error(`field ${field} differs from replaces`);
    const indentMatch = m[0].match(/\n(\s*)"/);
    const indent = indentMatch ? indentMatch[1] : "        ";
    const closeIndent = indent.slice(0, Math.max(0, indent.length - 2));
    const body = `"${field}": [\n${newValue.map((v) => indent + JSON.stringify(v)).join(",\n")}\n${closeIndent}]`;
    return stepText.replace(m[0], () => body);
  }
  const needle = `"${field}": ${oldJson}`;
  if (!stepText.includes(needle)) throw new Error(`field ${field} with the expected value not found`);
  if (stepText.split(needle).length !== 2) throw new Error(`field ${field} value not unique inside the step`);
  return stepText.replace(needle, () => `"${field}": ${newJson}`);
}

const patch = JSON.parse(fs.readFileSync(patchPath, "utf8"));
const byFile = new Map();
for (const entry of patch) {
  if (!byFile.has(entry.file)) byFile.set(entry.file, []);
  byFile.get(entry.file).push(entry);
}

let landed = 0;
for (const [rel, entries] of byFile) {
  const file = path.join(REPO_ROOT, rel);
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  let text = crlf ? raw.replace(/\r\n/g, "\n") : raw;
  for (const entry of entries) {
    const [start, end] = locateStep(text, entry.stepId);
    let stepText = text.slice(start, end + 1);
    const current = JSON.parse(stepText);
    if (current.id !== entry.stepId) throw new Error(`located wrong object for ${entry.stepId}`);
    const replaces = entry.replaces ?? {};
    for (const [field, newValue] of Object.entries(entry)) {
      if (["file", "stepId", "replaces"].includes(field)) continue;
      if (!(field in replaces) && !(field in current)) {
        // A new field: inserted right after the step's "id" line, in its indentation.
        const idLine = stepText.match(/^(\s*)"id": "[^"]+",?\n/m);
        if (!idLine) throw new Error(`${entry.stepId}: id line not found`);
        const insertAt = idLine.index + idLine[0].length;
        stepText = stepText.slice(0, insertAt) + `${idLine[1]}"${field}": ${JSON.stringify(newValue)},\n` + stepText.slice(insertAt);
        continue;
      }
      if (!(field in replaces)) throw new Error(`${entry.stepId}: no replaces value given for ${field}`);
      if (JSON.stringify(current[field]) !== JSON.stringify(replaces[field])) {
        throw new Error(`${entry.stepId}: field ${field} in the file differs from the patch's replaces value`);
      }
      stepText = replaceField(stepText, field, replaces[field], newValue);
    }
    JSON.parse(stepText); // still valid JSON after the edits
    text = text.slice(0, start) + stepText + text.slice(end + 1);
    landed++;
  }
  fs.writeFileSync(file, crlf ? text.replace(/\n/g, "\r\n") : text);
  console.log(`${rel}: ${entries.length} step(s) landed`);
}
console.log(`done: ${landed} step(s) landed across ${byFile.size} file(s)`);
