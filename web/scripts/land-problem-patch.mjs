#!/usr/bin/env node
// Lands a problem patch produced by a content author into the hand-formatted quest files
// without reformatting anything around it.
//
// The patch is a JSON array of { file, problemId, replaces, problem }. For each entry the script
// finds the problem object that carries `"id": "<problemId>"` in the named file, confirms its
// current prompt matches `replaces` (so a stale patch cannot overwrite the wrong thing), and
// swaps the whole object for `problem` serialized in the file's own indentation. Everything
// outside that object is left byte for byte as it was, which keeps diffs reviewable.
//
// An entry may instead be { file, stepId, append: true, problem }: the problem is inserted after
// the last problem of the step carrying `"id": "<stepId>"`, with the next id in that step's
// sequence (the entry's problem.id must be exactly that id, so a stale patch cannot skip one).
//
// Optional second argument: a JSON array of idea entries to append to content/ideas.json (skipped
// for any id already present). Run the validator afterwards; this script does not.
//
//   node scripts/land-problem-patch.mjs <patch.json> [ideas.json]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const [patchPath, ideasPath] = process.argv.slice(2);
if (!patchPath) {
  console.error("usage: node scripts/land-problem-patch.mjs <patch.json> [ideas.json]");
  process.exit(2);
}

/** Index of the matching closing brace for the object whose opening brace is at `open`. */
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

/** The problem object enclosing the given `"id": "<pid>"` line: its [start, end] indices. */
function locateProblem(text, pid) {
  const needle = `"id": "${pid}"`;
  const at = text.indexOf(needle);
  if (at < 0) throw new Error(`id not found: ${pid}`);
  if (text.indexOf(needle, at + 1) >= 0) throw new Error(`id not unique: ${pid}`);
  const open = text.lastIndexOf("{", at);
  const close = matchBrace(text, open);
  return [open, close];
}

/** The step object carrying `"id": "<stepId>"`: its [start, end] indices. */
function locateStep(text, stepId) {
  const needle = `"id": "${stepId}"`;
  const at = text.indexOf(needle);
  if (at < 0) throw new Error(`step id not found: ${stepId}`);
  if (text.indexOf(needle, at + 1) >= 0) throw new Error(`step id not unique: ${stepId}`);
  const open = text.lastIndexOf("{", at);
  const close = matchBrace(text, open);
  return [open, close];
}

/** Appends `problem` after the last problem of the step; returns the new text. */
function appendProblem(text, stepId, problem) {
  const [sStart, sEnd] = locateStep(text, stepId);
  const step = JSON.parse(text.slice(sStart, sEnd + 1));
  if (!Array.isArray(step.problems) || step.problems.length === 0) throw new Error(`${stepId} has no problems to append after`);
  const last = step.problems[step.problems.length - 1];
  const expected = `${stepId}-p${String(step.problems.length + 1).padStart(2, "0")}`;
  if (problem.id !== expected) throw new Error(`append id for ${stepId} must be ${expected}, got ${problem.id}`);
  const [pStart, pEnd] = locateProblem(text, last.id);
  if (pStart < sStart || pEnd > sEnd) throw new Error(`last problem of ${stepId} lies outside the step`);
  const lineStart = text.lastIndexOf("\n", pStart) + 1;
  const indent = pStart - lineStart;
  const body = indentBody(JSON.stringify(problem, null, 2), indent);
  return text.slice(0, pEnd + 1) + ",\n" + " ".repeat(indent) + body + text.slice(pEnd + 1);
}

/** Re-indents a JSON.stringify(obj, null, 2) body so it sits at `indent` columns, first line excluded. */
function indentBody(json, indent) {
  const pad = " ".repeat(indent);
  return json.split("\n").map((line, i) => (i === 0 ? line : pad + line)).join("\n");
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
    if (entry.append) {
      text = appendProblem(text, entry.stepId, entry.problem);
      landed++;
      continue;
    }
    const [start, end] = locateProblem(text, entry.problemId);
    const current = JSON.parse(text.slice(start, end + 1));
    if (current.id !== entry.problemId) throw new Error(`located wrong object for ${entry.problemId}`);
    if (entry.replaces !== undefined && current.prompt !== entry.replaces) {
      throw new Error(`prompt mismatch for ${entry.problemId}: file has "${current.prompt.slice(0, 60)}"`);
    }
    if (entry.problem.id !== entry.problemId) throw new Error(`patch object id differs for ${entry.problemId}`);
    const lineStart = text.lastIndexOf("\n", start) + 1;
    const indent = start - lineStart;
    const body = indentBody(JSON.stringify(entry.problem, null, 2), indent);
    text = text.slice(0, start) + body + text.slice(end + 1);
    landed++;
  }
  fs.writeFileSync(file, crlf ? text.replace(/\n/g, "\r\n") : text);
  console.log(`${rel}: ${entries.length} problem(s) landed`);
}

if (ideasPath) {
  const ideasDoc = JSON.parse(fs.readFileSync(ideasPath, "utf8"));
  // Authors hand over either a bare array or the registry shape { ideas: [...] }.
  const ideas = Array.isArray(ideasDoc) ? ideasDoc : (ideasDoc.ideas ?? []);
  const file = path.join(REPO_ROOT, "content", "ideas.json");
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  const list = doc.ideas ?? doc;
  let added = 0;
  for (const idea of ideas) {
    if (list.some((i) => i.id === idea.id)) continue;
    list.push({ id: idea.id, name: idea.name, kid: idea.kid, firstWeek: idea.firstWeek });
    added++;
  }
  fs.writeFileSync(file, JSON.stringify(doc, null, 2) + "\n");
  console.log(`ideas.json: ${added} idea(s) added`);
}
console.log(`done: ${landed} problem(s) landed across ${byFile.size} file(s)`);
