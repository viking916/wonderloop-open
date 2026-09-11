// Renders every figure in one or more patch files ({ file, stepId, figure }[]) or every figure
// on the steps of the quest files given, into one HTML gallery, then photographs it in
// chunks: the way to look at a hundred authored figures without a hundred quest screenshots.
// usage: npx tsx scripts/figure-gallery.tsx <out.png-prefix> <patch.json | make.json>...
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { ProblemFigure } from "../components/quest/ProblemFigure";
import { diagramFrames, resolveDiagramFrame } from "../lib/content/diagram-frames";

const [outPrefix, ...inputs] = process.argv.slice(2);
if (!outPrefix || inputs.length === 0) { console.error("usage: figure-gallery.tsx <out-prefix> <files...>"); process.exit(1); }
type Entry = { id: string; figure: Parameters<typeof ProblemFigure>[0]["figure"] };
const entries: Entry[] = [];
for (const f of inputs) {
  const doc = JSON.parse(fs.readFileSync(f, "utf8"));
  if (Array.isArray(doc)) for (const e of doc) entries.push({ id: e.stepId ?? e.problemId ?? "?", figure: e.figure ?? e.explanationFigure });
  else for (const st of doc.steps ?? []) if (st.figure) entries.push({ id: st.id, figure: st.figure });
}
// A diagram with frames becomes one card per frame, each drawn as a still with that frame's
// items, so every frame can be looked at and linted like any other figure.
const expanded: Array<Entry & { caption?: string }> = [];
for (const e of entries) {
  const spec = e.figure.spec as Record<string, unknown>;
  const frames = e.figure.kind === "diagram" ? diagramFrames(spec) : [];
  if (frames.length === 0) { expanded.push(e); continue; }
  frames.forEach((f, i) => {
    const still = { ...e.figure, spec: { ...spec, frames: undefined, items: resolveDiagramFrame(spec, i) } };
    expanded.push({ id: `${e.id} [frame ${i + 1}/${frames.length}]`, figure: still, caption: f.caption });
  });
}
const cards = expanded.map((e) => {
  let svg = "";
  if (e.figure.kind === "scene") svg = `<p style="color:#6b6357">3D scene (${String((e.figure.spec as Record<string, unknown>).type)}): look at it in the app, not here.</p>`;
  else {
    try { svg = renderToStaticMarkup(<ProblemFigure figure={e.figure} />); } catch (err) { svg = `<p style="color:#a33">render failed: ${String(err)}</p>`; }
  }
  const cap = e.caption ? `<div class="cap">${e.caption}</div>` : "";
  return `<div class="card"><div class="id">${e.id}</div>${svg}${cap}<div class="alt">${e.figure.alt}</div></div>`;
});
const appCss = fs.readFileSync(path.resolve(__dirname, "../app/globals.css"), "utf8").replace(/@import[^;]*;/g, "");
const html = `<!doctype html><meta charset="utf-8"><style>${appCss}</style><style>
body{margin:0;padding:16px;background:#e8dcc4 !important;font:13px system-ui}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.card{background:#fff;border-radius:8px;padding:10px}
.id{font:11px monospace;color:#6b6357;margin-bottom:6px}
.alt{color:#3a3a3a;margin-top:6px;font-size:11px}
.cap{color:#1f3d2b;font-size:12px;margin-top:4px;font-weight:600}
.tr-figure{margin:0;max-width:100%}.tr-figure-svg{width:100%;height:auto;display:block}
</style><div class="grid">${cards.join("")}</div>`;
const tmp = path.resolve(`${outPrefix}.html`);
fs.writeFileSync(tmp, html);
async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 1400 } });
  await page.goto(`file://${tmp}`);
  const total = await page.evaluate(() => document.body.scrollHeight);
  let n = 0;
  for (let y = 0; y < total; y += 1400) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.screenshot({ path: `${outPrefix}-${String(++n).padStart(2, "0")}.png` });
  }
  await browser.close();
  console.log(`${entries.length} figures, ${n} page(s), ${outPrefix}-NN.png`);
}
main().catch((err) => { console.error(err); process.exit(1); });
