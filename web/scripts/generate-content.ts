import fs from "node:fs";
import path from "node:path";
import { EXPECT_WEEKS, loadContent, problemsOf } from "../lib/content/load";

const root = path.resolve(process.argv[2] ?? "../content");
const r = loadContent(root, { expectWeeks: EXPECT_WEEKS });

if (!r.ok || !r.content) {
  for (const e of r.errors) console.error(`${path.relative(root, e.file).split(path.sep).join("/")}${e.path ? " :: " + e.path : ""}\n  ${e.message}`);
  console.error(`\n${r.errors.length} content error(s)`);
  process.exit(1);
}

const problems = r.content.quests.flatMap((q) => q.steps.flatMap(problemsOf));
const ladderTopics = Object.values(r.content.ladder.topics);
const ladderProblems = ladderTopics.reduce((n, t) => n + t.bank.length + t.stretch.length, 0);

fs.mkdirSync("generated", { recursive: true });
fs.writeFileSync(path.join("generated", "content.json"), JSON.stringify(r.content));

console.log(
  `content ok: ${r.content.quests.length} quests, ${problems.length} problems, ${r.content.sprout.length} sprout weeks, ${r.content.ideas.length} ideas, ${r.content.skills.length} skills, ladder ${r.content.ladder.graph.length} topics in the graph and ${ladderTopics.length} authored with ${ladderProblems} problems, wrote generated/content.json`,
);
