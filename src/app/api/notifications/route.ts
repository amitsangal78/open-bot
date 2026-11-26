import { connection } from "next/server";
import { errorResponse, guard } from "@/lib/core";
import { migratePostgres } from "@/lib/db/postgres";
import { unreadNotifications } from "@/lib/schedule/store";

export async function GET(request: Request) {
  await connection();
  try {
    guard(request);
    await migratePostgres();
    const encoder = new TextEncoder();
    let closed = false;
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          if (closed) return;
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        };
        const seen = new Set<string>();
        const push = async () => {
          const rows = await unreadNotifications();
          for (const row of rows) {
            if (seen.has(row.id)) continue;
            seen.add(row.id);
            send("notification", row);
          }
          send("unread", { count: rows.length });
        };
        await push();
        const timer = setInterval(() => {
          void push().catch(() => undefined);
        }, 5000);
        const stop = () => {
          closed = true;
          clearInterval(timer);
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        };
        request.signal.addEventListener("abort", stop);
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
