import { connection } from "next/server";
import { z } from "zod";
import { errorResponse, guard, readJson } from "@/lib/core";
import { migratePostgres } from "@/lib/db/postgres";
import { WEEKDAYS } from "@/lib/schedule/time";
import { deleteSchedule, updateSchedule } from "@/lib/schedule/store";

const bodySchema = z.object({
  name: z.string().optional(),
  time: z.string().optional(),
  weekdays: z.array(z.enum(WEEKDAYS)).min(1).optional(),
  prompt: z.string().optional(),
  status: z.enum(["active", "paused", "cancelled"]).optional(),
});

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await connection();
  try {
    guard(request);
    await migratePostgres();
    const id = z.string().uuid().parse((await params).id);
    await deleteSchedule(id);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await connection();
  try {
    guard(request);
    await migratePostgres();
    const id = z.string().uuid().parse((await params).id);
    await updateSchedule(id, bodySchema.parse(await readJson(request)));
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
