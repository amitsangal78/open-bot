import { randomUUID } from "node:crypto";
import { closePostgres, migratePostgres, postgresReady } from "../lib/db/postgres";
import { tickSchedules } from "../lib/schedule/store";

let timer: ReturnType<typeof setInterval> | undefined;
const owner = randomUUID();
let ticking = false;

async function main() {
  await migratePostgres();
  await postgresReady();
  console.log("[worker] Ready. Scheduled prompts use the timezone in Settings.");
  const tick = async () => {
    if (ticking) return;
    ticking = true;
    try {
      await tickSchedules(owner);
    } catch (error) {
      console.error(
        "[worker]",
        error instanceof Error ? error.message : "Scheduler tick failed.",
      );
    } finally {
      ticking = false;
    }
  };
  await tick();
  timer = setInterval(() => void tick(), 10_000);
}

async function shutdown() {
  if (timer) clearInterval(timer);
  await closePostgres();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
void main().catch((error: unknown) => {
  console.error(
    "[worker]",
    error instanceof Error ? error.message : "Worker failed to start.",
  );
  process.exit(1);
});
