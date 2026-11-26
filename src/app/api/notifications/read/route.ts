import { connection } from "next/server";
import { errorResponse, guard } from "@/lib/core";
import { migratePostgres } from "@/lib/db/postgres";
import { markNotificationsRead } from "@/lib/schedule/store";

export async function POST(request: Request) {
  await connection();
  try {
    guard(request);
    await migratePostgres();
    await markNotificationsRead();
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
