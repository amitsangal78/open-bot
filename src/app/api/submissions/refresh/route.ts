import { connection } from "next/server";
import { errorResponse, guard } from "@/lib/core";
import { migratePostgres } from "@/lib/db/postgres";
import { refreshSubmissions } from "@/lib/docyard/store";

export async function POST(request: Request) {
  await connection();
  try {
    guard(request);
    await migratePostgres();
    const result = await refreshSubmissions();
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
