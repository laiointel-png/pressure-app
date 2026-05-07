import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const htmlPath = path.join(root, "index.html");
const html = fs.readFileSync(htmlPath, "utf8");

const ids = [];
const idRe = /id="([^"]+)"/g;
for (let match = idRe.exec(html); match; match = idRe.exec(html)) ids.push(match[1]);

const counts = new Map();
for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
const duplicates = [...counts.entries()].filter(([, count]) => count > 1);

const required = [
  "screen-onboard",
  "onboard-form",
  "onboard-name",
  "onboard-group-name",
  "home-group-title",
  "group-title",
  "action-sheet",
];
const missing = required.filter((id) => !counts.has(id));

const actionSheetOk =
  /id="action-sheet"[^>]*role="dialog"/.test(html) &&
  /id="action-sheet"[^>]*aria-modal="true"/.test(html);

if (duplicates.length) {
  console.error("FAIL: duplicate ids found:");
  for (const [id, count] of duplicates) console.error(`- ${id} (${count}x)`);
  process.exitCode = 1;
}

if (missing.length) {
  console.error("FAIL: missing required ids:");
  for (const id of missing) console.error(`- ${id}`);
  process.exitCode = 1;
}

if (!actionSheetOk) {
  console.error("FAIL: action-sheet missing role=dialog and/or aria-modal=true");
  process.exitCode = 1;
}

if (!process.exitCode) {
  console.log("OK: basic DOM + a11y structure checks passed");
}

