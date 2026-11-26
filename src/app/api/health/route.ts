import { connection } from "next/server";
import {
  defaultSettings,
  migratePostgres,
  modelReady,
  postgresReady,
  readSettings,
} from "@/lib/db/postgres";

export async function GET() {
  await connection();
  let database: "ready" | "unavailable" = "unavailable";
  let model: "ready" | "unavailable" = "unavailable";
  try {
    await migratePostgres();
    await postgresReady();
    database = "ready";
    const settings = await readSettings().catch(() => defaultSettings);
    if (await modelReady(settings.modelAddress)) model = "ready";
  } catch {
    database = "unavailable";
  }
  return Response.json(
    { database, model },
    {
      status: database === "ready" ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
