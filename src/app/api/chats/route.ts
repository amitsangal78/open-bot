import { connection } from "next/server";
import { AppError, errorResponse, guard } from "@/lib/core";
import { migratePostgres } from "@/lib/db/postgres";
import { splitChats } from "@/lib/chat/prompt";
import { listChats } from "@/lib/chat/store";

export async function GET(request: Request) {
  await connection();
  try {
    guard(request);
    await migratePostgres();
    const view = new URL(request.url).searchParams.get("view");
    if (view !== "recent" && view !== "archive")
      throw new AppError("Choose recent or archive.");
    const split = splitChats(await listChats());
    return Response.json(
      { chats: view === "recent" ? split.recent : split.archive },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
