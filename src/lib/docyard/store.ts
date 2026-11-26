import { randomUUID } from "node:crypto";
import { getPool } from "../db/postgres";
import { AppError } from "../core";
import {
  docyardOrigin,
  submissionKey,
  submissionStatuses,
  submitSummary,
  type DocYardStatus,
} from "./client";

type Row = {
  id: string;
  chat_id: string;
  submission_key: string;
  docyard_id: string | null;
  status: string;
  dashboard_path: string | null;
  result: DocYardStatus | Record<string, never>;
  last_error: string | null;
  checked_at: Date | null;
};

export async function latestSubmission(chatId: string) {
  const result = await getPool().query<Row>(
    `SELECT id, chat_id, submission_key, docyard_id, status, dashboard_path, result, last_error, checked_at
     FROM docyard_submissions WHERE chat_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [chatId],
  );
  return result.rows[0] ? publicSubmission(result.rows[0]) : null;
}

export async function shareSummary(input: {
  chatId: string;
  title: string;
  text: string;
}) {
  const key = submissionKey(input.chatId, input.text);
  const existing = await getPool().query<Row>(
    `SELECT id, chat_id, submission_key, docyard_id, status, dashboard_path, result, last_error, checked_at
     FROM docyard_submissions WHERE submission_key = $1`,
    [key],
  );
  const saved = existing.rows[0];
  if (saved?.docyard_id) return publicSubmission(saved);
  let receipt;
  try {
    receipt = await submitSummary({ ...input, key });
  } catch (error) {
    if (saved)
      await getPool().query(
        `UPDATE docyard_submissions SET last_error = $2, updated_at = now() WHERE id = $1`,
        [saved.id, error instanceof Error ? error.message : "DocYard did not respond."],
      );
    throw error;
  }
  const id = saved?.id || randomUUID();
  await getPool().query(
    `INSERT INTO docyard_submissions
      (id, chat_id, submission_key, docyard_id, status, dashboard_path, last_error, checked_at)
     VALUES ($1, $2, $3, $4, $5, $6, NULL, now())
     ON CONFLICT (submission_key) DO UPDATE
     SET docyard_id = EXCLUDED.docyard_id, status = EXCLUDED.status,
         dashboard_path = EXCLUDED.dashboard_path, last_error = NULL,
         checked_at = now(), updated_at = now()`,
    [id, input.chatId, key, receipt.submissionId, receipt.status, receipt.dashboardPath],
  );
  const stored = await getPool().query<Row>(
    `SELECT id, chat_id, submission_key, docyard_id, status, dashboard_path, result, last_error, checked_at
     FROM docyard_submissions WHERE submission_key = $1`,
    [key],
  );
  return publicSubmission(stored.rows[0]);
}

export async function refreshSubmissions() {
  const rows = await getPool().query<Row>(
    `SELECT id, chat_id, submission_key, docyard_id, status, dashboard_path, result, last_error, checked_at
     FROM docyard_submissions WHERE docyard_id IS NOT NULL ORDER BY created_at DESC LIMIT 100`,
  );
  if (!rows.rowCount) return { ok: true as const, checked: 0 };
  try {
    const items = await submissionStatuses(
      rows.rows.map((row) => row.docyard_id).filter((id): id is string => Boolean(id)),
    );
    const byId = new Map(items.map((item) => [item.submissionId, item]));
    for (const row of rows.rows) {
      const item = row.docyard_id ? byId.get(row.docyard_id) : undefined;
      if (!item || item.status === "unavailable") {
        await getPool().query(
          `UPDATE docyard_submissions SET last_error = $2, checked_at = now(), updated_at = now() WHERE id = $1`,
          [row.id, "DocYard did not return this submission."],
        );
        continue;
      }
      await getPool().query(
        `UPDATE docyard_submissions
         SET result = $2, last_error = NULL, checked_at = now(), updated_at = now()
         WHERE id = $1`,
        [row.id, JSON.stringify(item)],
      );
    }
    return { ok: true as const, checked: rows.rowCount };
  } catch (error) {
    const message = error instanceof AppError ? error.message : "DocYard did not respond.";
    await getPool().query(
      `UPDATE docyard_submissions SET last_error = $2, updated_at = now()
       WHERE docyard_id IS NOT NULL`,
      [message],
    );
    return { ok: false as const, error: message };
  }
}

function publicSubmission(row: Row) {
  const result = row.result && "outputs" in row.result ? row.result : null;
  let dashboardUrl = "";
  if (row.dashboard_path) {
    try {
      dashboardUrl = new URL(row.dashboard_path, docyardOrigin()).toString();
    } catch {
      dashboardUrl = "";
    }
  }
  return {
    id: row.id,
    chatId: row.chat_id,
    docyardId: row.docyard_id,
    status: row.status,
    dashboardUrl,
    outputs: result?.outputs || [],
    lastError: row.last_error,
    checkedAt: row.checked_at ? new Date(row.checked_at).toISOString() : null,
  };
}
