// Starts the game server and the website together, in one terminal.
//
//   yarn dev
//
// Each line of output is prefixed with where it came from. Ctrl+C stops both,
// and if either one exits on its own the other is stopped too, so you never
// end up with half the game running.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const apps = [
  { name: "server", dir: "backend", color: "\x1b[35m" },
  { name: "web", dir: "frontend", color: "\x1b[36m" },
];

const reset = "\x1b[0m";
const width = Math.max(...apps.map((a) => a.name.length));
const children = [];
let stopping = false;

function prefix(app, stream, out) {
  let pending = "";
  stream.on("data", (chunk) => {
    pending += chunk.toString();
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    for (const line of lines) out.write(`${app.color}${app.name.padEnd(width)} |${reset} ${line}\n`);
  });
  stream.on("end", () => {
    if (pending) out.write(`${app.color}${app.name.padEnd(width)} |${reset} ${pending}\n`);
  });
}

function stopAll(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null) continue;
    if (process.platform === "win32") {
      // yarn runs the app in a child of its own; kill the whole tree.
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      child.kill("SIGTERM");
    }
  }
  setTimeout(() => process.exit(code), 500);
}

for (const app of apps) {
  // One command string with shell: true, so Windows finds yarn.cmd without
  // Node's warning about unescaped arguments.
  const child = spawn("yarn dev", {
    cwd: path.join(root, app.dir),
    shell: true,
    env: { ...process.env, FORCE_COLOR: "1" },
  });
  children.push(child);
  prefix(app, child.stdout, process.stdout);
  prefix(app, child.stderr, process.stderr);
  child.on("exit", (code) => {
    if (stopping) return;
    console.log(`${app.color}${app.name.padEnd(width)} |${reset} exited with code ${code ?? 0} - stopping the other one too.`);
    stopAll(code ?? 0);
  });
}

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
