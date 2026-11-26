import { createHash } from "node:crypto";
import { AppError } from "../core";

export type DocYardReceipt = {
  submissionId: string;
  status: string;
  dashboardPath: string;
};

export type DocYardStatus = {
  submissionId: string;
  status: string;
  title?: string;
  outputs: {
    outputId: string;
    format: string;
    status: string;
    pageUrl: string | null;
    downloadPath: string | null;
  }[];
};

export function submissionKey(chatId: string, text: string) {
  const digest = createHash("sha256").update(text).digest("hex").slice(0, 24);
  return `chat.${chatId}.${digest}`;
}

export function docyardOrigin() {
  const raw = process.env.DOCYARD_URL || "http://127.0.0.1:3001";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError("DocYard must be on this machine.");
  }
  if (url.protocol !== "http:") throw new AppError("DocYard must be on this machine.");
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost")
    throw new AppError("DocYard must be on this machine.");
  return url.origin;
}

function clientToken() {
  const token = process.env.DOCYARD_CLIENT_TOKEN || "";
  if (!token)
    throw new AppError("Set DOCYARD_CLIENT_TOKEN before sharing a summary.");
  return token;
}

export async function submitSummary(input: {
  key: string;
  chatId: string;
  title: string;
  text: string;
}): Promise<DocYardReceipt> {
  const body = {
    schemaVersion: "1",
    source: { kind: "chat", itemRef: input.chatId },
    content: {
      title: input.title,
      blocks: [{ type: "paragraph", text: input.text }],
    },
    references: [],
    capturedAt: new Date().toISOString(),
  };
  const payload = await call("/api/v1/submissions", body, input.key);
  const submissionId = stringField(payload, "submissionId");
  if (!submissionId) throw new AppError("DocYard did not accept the summary.");
  return {
    submissionId,
    status: stringField(payload, "status") || "awaiting_review",
    dashboardPath: stringField(payload, "dashboardPath") || `/inbox/${submissionId}`,
  };
}

export async function submissionStatuses(ids: string[]) {
  if (!ids.length) return [] as DocYardStatus[];
  const payload = await call("/api/v1/submissions/status-query", { ids });
  const items = Array.isArray(payload.items) ? payload.items : [];
  return items.map((item) => {
    const row = item as Record<string, unknown>;
    const outputs = Array.isArray(row.outputs) ? row.outputs : [];
    return {
      submissionId: stringField(row, "submissionId") || stringField(row, "id") || "",
      status: row.unavailable === true ? "unavailable" : "received",
      title: stringField(row, "title"),
      outputs: outputs.map((output) => {
        const value = output as Record<string, unknown>;
        return {
          outputId: stringField(value, "outputId") || stringField(value, "id") || "",
          format: stringField(value, "format") || "file",
          status: stringField(value, "status") || "",
          pageUrl: stringField(value, "pageUrl") || null,
          downloadPath: stringField(value, "downloadPath") || null,
        };
      }),
    };
  });
}

async function call(path: string, body: unknown, key?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${clientToken()}`,
  };
  if (key) headers["Idempotency-Key"] = key;
  let response: Response;
  try {
    response = await fetch(`${docyardOrigin()}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new AppError("DocYard did not respond.");
  }
  const payload = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
    items?: unknown;
  };
  if (!response.ok) {
    throw new AppError(payload.error?.message || "DocYard did not accept the summary.");
  }
  return payload as { items?: unknown } & Record<string, unknown>;
}

function stringField(value: Record<string, unknown>, key: string) {
  return typeof value[key] === "string" ? value[key] : "";
}
