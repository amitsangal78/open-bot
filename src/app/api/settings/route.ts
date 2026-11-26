import { connection } from "next/server";
import { errorResponse, guard, readJson } from "@/lib/core";
import {
  migratePostgres,
  readSettings,
  settingsSchema,
  writeSettings,
} from "@/lib/db/postgres";

export async function GET(request: Request) {
  await connection();
  try {
    guard(request);
    await migratePostgres();
    return Response.json(await readSettings(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  await connection();
  try {
    guard(request);
    await migratePostgres();
    const saved = await writeSettings(settingsSchema.parse(await readJson(request)));
    return Response.json(saved, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
