import { randomUUID } from "node:crypto";
import { getPool } from "@/lib/db/postgres";
import { connectTarget } from "@/lib/mcp/match";

export type ChatSummary = {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  role: string;
  content: string;
  toolName: string | null;
  toolCallId: string | null;
  toolCalls: string | null;
  createdAt: string;
};

type ChatRow = {
  id: string;
  title: string;
  status: string;
  created_at: Date;
  updated_at: Date;
};

type MessageRow = {
  id: string;
  role: string;
  content: string;
  tool_name: string | null;
  tool_call_id: string | null;
  tool_calls: string | null;
  created_at: Date;
};

function chatSummary(row: ChatRow): ChatSummary {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function messageOf(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    toolName: row.tool_name,
    toolCallId: row.tool_call_id,
    toolCalls: row.tool_calls,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function listChats() {
  const result = await getPool().query<ChatRow>(
    `SELECT id, title, status, created_at, updated_at
     FROM chats
     ORDER BY updated_at DESC, id DESC`,
  );
  return result.rows.map(chatSummary);
}

export async function getChat(id: string) {
  const chat = await getPool().query<ChatRow>(
    `SELECT id, title, status, created_at, updated_at FROM chats WHERE id = $1`,
    [id],
  );
  if (!chat.rowCount) return null;
  const messages = await getPool().query<MessageRow>(
    `SELECT id, role, content, tool_name, tool_call_id, tool_calls, created_at
     FROM messages WHERE chat_id = $1 ORDER BY position ASC`,
    [id],
  );
  const pending = await pendingApproval(id);
  const mapped = messages.rows.map(messageOf);
  const summary = chatSummary(chat.rows[0]);
  return {
    ...summary,
    messages: mapped,
    approval: pending
      ? { id: pending.id, kind: pending.kind, change: pending.change }
      : null,
    connect: summary.status === "needs_auth" ? connectTarget(mapped) : null,
  };
}

export async function ensureChat(id: string, title: string) {
  await getPool().query(
    `INSERT INTO chats (id, title) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
    [id, title.slice(0, 80)],
  );
}

export async function renameChat(id: string, title: string) {
  const result = await getPool().query(
    `UPDATE chats SET title = $2, updated_at = now() WHERE id = $1`,
    [id, title],
  );
  return Boolean(result.rowCount);
}

export async function deleteChat(id: string) {
  await getPool().query(`DELETE FROM leases WHERE id = $1`, [`chat:${id}`]);
  const result = await getPool().query(`DELETE FROM chats WHERE id = $1`, [id]);
  return Boolean(result.rowCount);
}

export async function setChatStatus(id: string, status: string) {
  await getPool().query(
    `UPDATE chats SET status = $2, updated_at = now() WHERE id = $1`,
    [id, status],
  );
}

export async function chatIsRunning(id: string) {
  const result = await getPool().query(
    `SELECT 1 FROM leases WHERE id = $1 AND expires_at > now()`,
    [`chat:${id}`],
  );
  return Boolean(result.rowCount);
}

export async function claimChat(id: string, owner: string) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const lease = await client.query(
      `INSERT INTO leases (id, owner, expires_at)
       VALUES ($1, $2, now() + interval '5 minutes')
       ON CONFLICT (id) DO UPDATE
       SET owner = EXCLUDED.owner, expires_at = EXCLUDED.expires_at
       WHERE leases.expires_at < now()
       RETURNING owner`,
      [`chat:${id}`, owner],
    );
    if (!lease.rowCount) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query(`UPDATE chats SET status = 'running' WHERE id = $1`, [id]);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function extendLease(id: string, owner: string) {
  await getPool().query(
    `UPDATE leases SET expires_at = now() + interval '5 minutes'
     WHERE id = $1 AND owner = $2`,
    [`chat:${id}`, owner],
  );
}

export async function releaseLease(id: string, owner: string) {
  await getPool().query(`DELETE FROM leases WHERE id = $1 AND owner = $2`, [
    `chat:${id}`,
    owner,
  ]);
}

async function nextPosition(chatId: string) {
  const result = await getPool().query<{ position: number }>(
    `SELECT COALESCE(MAX(position), 0) + 1 AS position FROM messages WHERE chat_id = $1`,
    [chatId],
  );
  return result.rows[0].position;
}

export async function addMessage(
  chatId: string,
  input: {
    role: string;
    content: string;
    toolName?: string | null;
    toolCallId?: string | null;
    toolCalls?: string | null;
  },
) {
  const id = randomUUID();
  const position = await nextPosition(chatId);
  await getPool().query(
    `INSERT INTO messages
      (id, chat_id, position, role, content, tool_name, tool_call_id, tool_calls)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      chatId,
      position,
      input.role,
      input.content,
      input.toolName ?? null,
      input.toolCallId ?? null,
      input.toolCalls ?? null,
    ],
  );
  await getPool().query(`UPDATE chats SET updated_at = now() WHERE id = $1`, [
    chatId,
  ]);
  return id;
}

export async function updateMessage(id: string, content: string) {
  await getPool().query(`UPDATE messages SET content = $2 WHERE id = $1`, [
    id,
    content,
  ]);
}

export async function deleteMessage(id: string) {
  await getPool().query(`DELETE FROM messages WHERE id = $1`, [id]);
}

export async function deleteConnectMessages(chatId: string) {
  await getPool().query(
    `DELETE FROM messages
     WHERE chat_id = $1 AND role = 'assistant' AND tool_calls LIKE '%"name":"connect"%'`,
    [chatId],
  );
}

export type Approval = {
  id: string;
  kind: string;
  change: string;
  payload: string;
};

export async function pendingApproval(chatId: string): Promise<Approval | null> {
  const result = await getPool().query<Approval>(
    `SELECT id, kind, change, payload
     FROM operations
     WHERE chat_id = $1 AND status = 'pending'
     ORDER BY created_at DESC
     LIMIT 1`,
    [chatId],
  );
  return result.rows[0] ?? null;
}

export async function beginOperation(input: {
  id: string;
  chatId: string;
  kind: string;
  change: string;
  payload: string;
}) {
  await getPool().query(
    `INSERT INTO operations (id, chat_id, kind, change, payload)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO NOTHING`,
    [input.id, input.chatId, input.kind, input.change, input.payload],
  );
  const result = await getPool().query<{ status: string }>(
    `SELECT status FROM operations WHERE id = $1`,
    [input.id],
  );
  return result.rows[0]?.status ?? "pending";
}

export async function finishOperation(
  id: string,
  status: "applied" | "rejected",
) {
  const result = await getPool().query(
    `UPDATE operations SET status = $2 WHERE id = $1 AND status = 'pending'`,
    [id, status],
  );
  return Boolean(result.rowCount);
}
