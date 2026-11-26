import { connection } from "next/server";
import { z } from "zod";
import { errorResponse, guard, readJson } from "@/lib/core";
import { migratePostgres } from "@/lib/db/postgres";
import { WEEKDAYS } from "@/lib/schedule/time";
import { createSchedule, listRuns, listSchedules } from "@/lib/schedule/store";

const bodySchema = z.object({
  name: z.string(),
  time: z.string(),
  weekdays: z.array(z.enum(WEEKDAYS)).min(1),
  prompt: z.string(),
});

export async function GET(request: Request) {
  await connection();
  try {
    guard(request);
    await migratePostgres();
    return Response.json(
      { schedules: await listSchedules(), runs: await listRuns() },
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
    const created = await createSchedule(bodySchema.parse(await readJson(request)));
    return Response.json(created, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
