import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
const root = new URL("../", import.meta.url);
const apps = [
  { name: "open-agent", dir: fileURLToPath(root), port: 3000 },
  {
    name: "DocYard",
    dir: fileURLToPath(new URL("../DocYard/", root)),
    port: 3001,
  },
  {
    name: "CreativeNest",
    dir: fileURLToPath(new URL("../CreativeNest/", root)),
    port: 3002,
  },
];
if (process.version !== "v22.15.0")
  throw new Error("Run nvm use 22.15.0 before starting the apps.");
for (const app of apps) {
  await access(`${app.dir}/node_modules`);
  await access(`${app.dir}/.env.local`);
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", () =>
      reject(
        new Error(
          `${app.name}: port ${app.port} is already in use. Stop that server first.`,
        ),
      ),
    );
    server.listen(app.port, "127.0.0.1", () => server.close(resolve));
  });
}
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    if (!child.pid) continue;
    try {
      process.kill(-child.pid, "SIGINT");
    } catch {}
  }
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
for (const app of apps) {
  console.log(`${app.name}: http://127.0.0.1:${app.port}`);
  const child = spawn("npm", ["run", "dev"], {
    cwd: app.dir,
    stdio: "inherit",
    detached: true,
  });
  children.push(child);
  child.on("error", (error) => {
    console.error(`${app.name}: ${error.message}`);
    stop(1);
  });
  child.on("exit", (code) => {
    if (!stopping) stop(code || 1);
  });
}
