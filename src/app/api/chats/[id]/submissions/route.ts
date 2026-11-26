import { connection } from "next/server";
import { z } from "zod";
import { AppError, errorResponse, guard } from "@/lib/core";
import { migratePostgres } from "@/lib/db/postgres";
import { getChat } from "@/lib/chat/store";
import { latestSubmission } from "@/lib/docyard/store";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await connection();
  try {
    guard(request);
    await migratePostgres();
    const id = z.string().uuid().parse((await params).id);
    if (!(await getChat(id))) throw new AppError("Chat not found.", 404);
    return Response.json(
      { submission: await latestSubmission(id) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
