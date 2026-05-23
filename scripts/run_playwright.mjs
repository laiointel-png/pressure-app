import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const port = Number(process.env.PRESSURE_PORT || 5173);
const host = "127.0.0.1";
const baseURL = `http://${host}:${port}`;

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

function safeJoin(base, requestPath) {
  const rel = requestPath.replace(/^\//, "");
  const resolved = path.resolve(base, rel);
  if (!resolved.startsWith(base)) return null;
  return resolved;
}

function serveFile(res, filePath) {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return false;
  const data = fs.readFileSync(filePath);
  res.writeHead(200, {
    "content-type": contentType(filePath),
    "cache-control": "no-store",
  });
  res.end(data);
  return true;
}

function createServer() {
  return http.createServer((req, res) => {
    try {
      const url = new URL(req.url || "/", baseURL);
      const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
      const filePath = safeJoin(root, pathname);
      if (!filePath) {
        res.writeHead(400);
        res.end("bad path");
        return;
      }

      if (serveFile(res, filePath)) return;

      // Simple fallback: allow hash routing by returning index.html for unknown paths.
      if (pathname === "/onboard" || pathname === "/home" || pathname === "/group" || pathname === "/billing") {
        const indexPath = path.join(root, "index.html");
        serveFile(res, indexPath);
        return;
      }

      res.writeHead(404);
      res.end("not found");
    } catch {
      res.writeHead(500);
      res.end("error");
    }
  });
}

function runPlaywright(args) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, PRESSURE_BASE_URL: baseURL };
    const child = spawn("npx", ["playwright", "test", "-c", "playwright.config.mjs", ...args], {
      env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`playwright_exit_${code}`));
    });
  });
}

const server = createServer();
server.listen(port, host, async () => {
  console.log(`pressure test server: ${baseURL}`);
  try {
    const headed = process.argv.includes("--headed");
    await runPlaywright(headed ? ["--headed"] : []);
    server.close(() => process.exit(0));
  } catch (err) {
    console.error("playwright failed");
    server.close(() => process.exit(1));
  }
});
