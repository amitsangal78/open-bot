import { connection } from "next/server";
import { z } from "zod";
import { errorResponse, guard, readJson } from "@/lib/core";
import { migratePostgres } from "@/lib/db/postgres";
import { disconnectConnection } from "@/lib/mcp/store";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await connection();
  try {
    guard(request);
    await migratePostgres();
    await readJson(request);
    const id = z.string().uuid().parse((await params).id);
    await disconnectConnection(id);
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
