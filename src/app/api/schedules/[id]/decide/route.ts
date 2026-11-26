import { connection } from "next/server";
import { z } from "zod";
import { errorResponse, guard, readJson } from "@/lib/core";
import { migratePostgres } from "@/lib/db/postgres";
import { decideRun } from "@/lib/schedule/store";

const bodySchema = z.object({
  runId: z.string().uuid(),
  decision: z.enum(["run", "skip"]),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await connection();
  try {
    guard(request);
    await migratePostgres();
    const id = z.string().uuid().parse((await params).id);
    const input = bodySchema.parse(await readJson(request));
    const result = await decideRun(id, input.runId, input.decision);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
