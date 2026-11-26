import { closePostgres, migratePostgres } from "../src/lib/db/postgres";

async function main() {
  try {
    await migratePostgres();
    console.log("Postgres migrations applied.");
  } finally {
    await closePostgres();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Migration failed.");
  process.exit(1);
});
