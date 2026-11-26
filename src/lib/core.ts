import { resolve } from "node:path";
import { z } from "zod";

export const TZ = "Asia/Kolkata";
export const dataPath = (...parts: string[]) =>
  resolve(process.env.DATA_DIR || "./data", ...parts);
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code?: string,
  ) {
    super(message);
  }
}
export function safeError(error: unknown) {
  if (error instanceof AppError) return error.message;
  if (error instanceof z.ZodError)
    return error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
  const status = (error as { status?: number })?.status;
  if (status === 401 || status === 403)
    return "The service rejected authentication. Check credentials or reconnect the account.";
  if (status === 413)
    return "The model request is too large for this account's input-token limit. Resume the reply after reducing the prompt budget, or start a shorter conversation.";
  if (status === 429)
    return "Service rate limit reached. Please wait before retrying.";
  return "The operation could not finish. Check the service configuration and try again.";
}
export function guard(
  request: Request,
  options?: { allowNavigation?: boolean },
) {
  const host = request.headers.get("host");
  if (!host || !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host))
    throw new AppError("Local access only.", 403);
  const origin = request.headers.get("origin");
  if (origin && origin !== `http://${host}`)
    throw new AppError("Cross-origin requests are blocked.", 403);
  if (
    !options?.allowNavigation &&
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new AppError("Cross-site requests are blocked.", 403);
}
export async function readJson(request: Request) {
  guard(request);
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new AppError("JSON required.", 415);
  let size = 0;
  const chunks: Uint8Array[] = [];
  if (!request.body) throw new AppError("Request body required.");
  const reader = request.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 100_000) {
        await reader.cancel();
        throw new AppError("Request too large.", 413);
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Invalid JSON.");
  }
}
export function errorResponse(error: unknown) {
  return Response.json(
    {
      error: safeError(error),
      ...(error instanceof AppError && error.code ? { code: error.code } : {}),
    },
    {
      status:
        error instanceof AppError
          ? error.status
          : error instanceof z.ZodError
            ? 400
            : 502,
    },
  );
}
