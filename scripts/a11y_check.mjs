import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(process.cwd());
const htmlPath = path.join(projectRoot, "index.html");

function fail(message) {
  console.error(`a11y_check: ${message}`);
  process.exitCode = 1;
}

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    fail(`cannot read ${filePath}: ${error?.message || error}`);
    return "";
  }
}

const html = readFileSafe(htmlPath);
if (!html) process.exit(1);

const ids = new Set();
const idRegex = /\sid="([^"]+)"/g;
for (const match of html.matchAll(idRegex)) ids.add(match[1]);

function assertIdExists(ref, context) {
  if (!ref) return;
  if (!ids.has(ref)) fail(`missing id "${ref}" referenced by ${context}`);
}

for (const match of html.matchAll(/\saria-labelledby="([^"]+)"/g)) {
  for (const part of match[1].split(/\s+/).filter(Boolean)) {
    assertIdExists(part, `aria-labelledby="${match[1]}"`);
  }
}

for (const match of html.matchAll(/\saria-describedby="([^"]+)"/g)) {
  for (const part of match[1].split(/\s+/).filter(Boolean)) {
    assertIdExists(part, `aria-describedby="${match[1]}"`);
  }
}

const interactiveRegex =
  /<(button|a|input|select|textarea)([^>]*?)>/g;
for (const match of html.matchAll(interactiveRegex)) {
  const tag = match[1];
  const attrs = match[2] || "";
  const hasAriaLabel = /\saria-label="[^"]+"/.test(attrs);
  const hasAriaLabelledBy = /\saria-labelledby="[^"]+"/.test(attrs);
  const hasTitle = /\stitle="[^"]+"/.test(attrs);
  const isHidden = /\saria-hidden="true"/.test(attrs);
  const isIconButton = /\sclass="[^"]*\bicon-button\b[^"]*"/.test(attrs);

  if (isHidden) continue;

  if (tag === "button" && isIconButton && !(hasAriaLabel || hasAriaLabelledBy || hasTitle)) {
    fail(`icon-button missing accessible label near: ${match[0].slice(0, 120)}...`);
  }
}

if (!process.exitCode) {
  console.log("a11y_check: ok");
}

