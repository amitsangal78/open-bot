import { randomUUID } from "node:crypto";
import { connection } from "next/server";
import { z } from "zod";
import { AppError, errorResponse, guard, readJson, safeError } from "@/lib/core";
import { migratePostgres, readSettings } from "@/lib/db/postgres";
import { runChat } from "@/lib/chat/run";
import {
  chatIsRunning,
  claimChat,
  deleteChat,
  ensureChat,
  getChat,
  pendingApproval,
  releaseLease,
  renameChat,
  setChatStatus,
} from "@/lib/chat/store";

const idSchema = z.string().uuid();
const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("send"),
    text: z.string().trim().min(1).max(8000),
  }),
  z.object({
    action: z.literal("resume"),
    approved: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("rename"),
    title: z.string().trim().min(1).max(100),
  }),
  z.object({ action: z.literal("delete") }),
]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await connection();
  try {
    guard(request);
    await migratePostgres();
    const id = idSchema.parse((await params).id);
    const chat = await getChat(id);
    if (!chat) throw new AppError("Chat not found.", 404);
    return Response.json(chat, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await connection();
  const owner = randomUUID();
  let claimed = false;
  let chatId = "";
  try {
    await migratePostgres();
    const id = idSchema.parse((await params).id);
    chatId = id;
    const input = actionSchema.parse(await readJson(request));
    if (input.action === "delete") {
      if (await chatIsRunning(id))
        throw new AppError("This conversation is already running.", 409);
      if (!(await deleteChat(id))) throw new AppError("Chat not found.", 404);
      return Response.json(
        { ok: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (input.action === "rename") {
      if (!(await renameChat(id, input.title)))
        throw new AppError("Chat not found.", 404);
      return Response.json(
        { ok: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const settings = await readSettings();
    if (!settings.modelName.trim())
      throw new AppError("Set a model name in Settings.");
    if (input.action === "send") {
      if (await pendingApproval(id))
        throw new AppError(
          "Accept or reject the waiting change before sending a new message.",
          409,
        );
      const title = input.text.replace(/\s+/g, " ").slice(0, 80);
      await ensureChat(id, title);
    } else if (!(await getChat(id))) {
      throw new AppError("Chat not found.", 404);
    }
    if (!(await claimChat(id, owner)))
      throw new AppError("This conversation is already running.", 409);
    claimed = true;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const emit = (type: string, data: unknown) => {
          controller.enqueue(
            encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        };
        try {
          emit("chat", { id });
          await runChat({
            chatId: id,
            owner,
            signal: request.signal,
            mode: input.action,
            text: input.action === "send" ? input.text : undefined,
            approved: input.action === "resume" ? input.approved : undefined,
            emit,
          });
        } catch (error) {
          emit("error", { error: safeError(error) });
          emit("done", { status: "failed" });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (claimed) {
      await setChatStatus(chatId, "idle").catch(() => undefined);
      await releaseLease(chatId, owner).catch(() => undefined);
    }
    return errorResponse(error);
  }
}
