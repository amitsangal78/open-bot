import { connection } from "next/server";
import { z } from "zod";
import { AppError, errorResponse, guard, readJson } from "@/lib/core";
import { migratePostgres } from "@/lib/db/postgres";
import { beginSignIn } from "@/lib/mcp/store";

const bodySchema = z.object({
  clientId: z.string().trim().min(1).max(500).optional(),
  clientSecret: z.string().trim().min(1).max(500).optional(),
  chatId: z.string().uuid().optional(),
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
    const host = request.headers.get("host");
    if (!host) throw new AppError("Local access only.", 403);
    const started = await beginSignIn({
      id,
      redirectUri: `http://${host}/api/connections/callback`,
      chatId: input.chatId,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
    });
    return Response.json(started, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
