import { execSync, spawn } from "node:child_process";

const runs = Number(process.env.PRESSURE_STRESS_RUNS || 10);

function run(cmd, env = {}) {
  execSync(cmd, {
    stdio: "inherit",
    env: { ...process.env, ...env }
  });
}

console.log(`stress: running ${runs} smoke cycles`);

for (let i = 1; i <= runs; i += 1) {
  console.log(`stress: cycle ${i}/${runs}`);
  run("npm run verify");
  run("npx playwright test -c playwright.config.mjs", {
    PLAYWRIGHT_HTML_REPORT: "0"
  });
}

console.log("stress: done");

