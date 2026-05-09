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
  "onboard-group-mode",
  "onboard-group-mode-create",
  "onboard-group-mode-join",
  "onboard-group-code",
  "onboard-preview-group",
  "home-group-title",
  "group-title",
  "group-hero-title",
  "member-list",
  "invite-button",
  "action-sheet",
  "billing-check-stripe",
  "billing-open-portal",
  "stripe-health-pill",
  "setup-mandate",
  "setup-pass-row",
  "setup-mandate-row",
  "setup-webhook-row",
  "success-label",
  "success-copy",
  "success-fee",
];
const missing = required.filter((id) => !counts.has(id));

const actionSheetOk =
  /id="action-sheet"[^>]*role="dialog"/.test(html) &&
  /id="action-sheet"[^>]*aria-modal="true"/.test(html);

const iconButtons = [...html.matchAll(/<button[^>]*class="icon-button[^"]*"[^>]*>/g)].map((match) => match[0]);
const iconButtonsMissingLabel = iconButtons.filter((tag) => !/aria-label="[^"]+"/.test(tag));

const billingConfirmOk = /id="billing-confirm"/.test(html) && /id="billing-confirm-hint"/.test(html);
const onboardGroupLegendOk = /id="onboard-group-mode"[\s\S]*<legend>Groep<\/legend>/.test(html);
const memberListOk = /id="member-list"[^>]*role="list"/.test(html) && /id="member-list"[^>]*aria-live="polite"/.test(html);
const onboardJoinHintOk = /id="onboard-group-code-hint"[^>]*>[^<]*Backend[^<]*opt/i.test(html);

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

if (iconButtonsMissingLabel.length) {
  console.error("FAIL: icon-button missing aria-label:");
  for (const tag of iconButtonsMissingLabel) console.error(`- ${tag}`);
  process.exitCode = 1;
}

if (!billingConfirmOk) {
  console.error("FAIL: billing confirm checkbox + hint ids missing");
  process.exitCode = 1;
}

if (!onboardGroupLegendOk) {
  console.error("FAIL: onboarding group fieldset missing legend");
  process.exitCode = 1;
}

if (!memberListOk) {
  console.error("FAIL: member-list missing role=list and/or aria-live=polite");
  process.exitCode = 1;
}

if (!onboardJoinHintOk) {
  console.error("FAIL: onboarding join hint missing or not marked optional");
  process.exitCode = 1;
}

if (!process.exitCode) {
  console.log("OK: basic DOM + a11y structure checks passed");
}
