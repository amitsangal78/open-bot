import { connection, NextResponse } from "next/server";
import { AppError, errorResponse, guard, safeError } from "@/lib/core";
import { migratePostgres } from "@/lib/db/postgres";
import { finishSignIn } from "@/lib/mcp/store";

export async function GET(request: Request) {
  await connection();
  let host = "";
  try {
    guard(request, { allowNavigation: true });
    host = request.headers.get("host") || "";
    if (!host) throw new AppError("Local access only.", 403);
  } catch (error) {
    return errorResponse(error);
  }
  const url = new URL(request.url);
  try {
    await migratePostgres();
    const state = url.searchParams.get("state") || "";
    const code = url.searchParams.get("code") || "";
    if (!state || !code || url.searchParams.get("error"))
      throw new AppError("Sign-in could not be completed.");
    const done = await finishSignIn({
      state,
      code,
      redirectUri: `http://${host}/api/connections/callback`,
    });
    const next = done.chatId
      ? `/?chat=${done.chatId}&continue=1`
      : "/?tab=connect";
    return NextResponse.redirect(`http://${host}${next}`);
  } catch (error) {
    const message = encodeURIComponent(safeError(error));
    return NextResponse.redirect(`http://${host}/?tab=connect&error=${message}`);
  }
}
