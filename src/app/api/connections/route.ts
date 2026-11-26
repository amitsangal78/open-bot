import { connection } from "next/server";
import { z } from "zod";
import { errorResponse, guard, readJson } from "@/lib/core";
import { migratePostgres } from "@/lib/db/postgres";
import { createConnection, listConnections } from "@/lib/mcp/store";

const createSchema = z.union([
  z.object({ provider: z.enum(["gmail", "notion"]) }),
  z.object({
    name: z.string().trim().min(1).max(80),
    url: z.string().trim().min(1).max(500),
  }),
]);

export async function GET(request: Request) {
  await connection();
  try {
    guard(request);
    await migratePostgres();
    return Response.json(
      { connections: await listConnections() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  await connection();
  try {
    guard(request);
    await migratePostgres();
    const input = createSchema.parse(await readJson(request));
    const created = await createConnection(
      "provider" in input ? { provider: input.provider } : input,
    );
    return Response.json(created, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
