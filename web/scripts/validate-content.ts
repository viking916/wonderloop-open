import path from "node:path";
import { EXPECT_WEEKS, loadContent } from "../lib/content/load";

const root = path.resolve(process.argv[2] ?? "../content");
const expectWeeks = process.argv.includes("--partial") ? undefined : EXPECT_WEEKS;
const r = loadContent(root, { expectWeeks });
if (r.ok && r.content) {
  const problems = r.content.quests.flatMap((q) => q.steps.flatMap((s) => (s.kind === "warmup" || s.kind === "problem-set" ? s.problems : s.kind === "puzzle-of-week" ? [s.problem] : [])));
  console.log(`content ok: ${r.content.quests.length} quests, ${problems.length} problems, ${r.content.sprout.length} sprout weeks, ${r.content.ideas.length} ideas, ${r.content.skills.length} skills`);
  process.exit(0);
}
for (const e of r.errors) console.error(`${path.relative(root, e.file).split(path.sep).join("/")}${e.path ? " :: " + e.path : ""}\n  ${e.message}`);
console.error(`\n${r.errors.length} content error(s)`);
process.exit(1);
