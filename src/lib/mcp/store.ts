import { randomUUID } from "node:crypto";
import { getPool } from "../db/postgres";
import { AppError } from "../core";
import { decryptSecret, encryptSecret } from "../secrets";
import {
  GMAIL_MCP_URL,
  NOTION_MCP_URL,
  type OauthMeta,
  assertMcpUrl,
  buildAuthorizeUrl,
  discoverOauth,
  exchangeToken,
  newVerifier,
  registerClient,
} from "./oauth";

export type PublicConnection = {
  id: string;
  name: string;
  url: string;
  state: "needs_auth" | "connected" | "disconnected";
};

type ConnectionRow = PublicConnection & {
  client_id: string | null;
  client_secret_enc: string | null;
  token_enc: string | null;
  oauth_state: string | null;
  oauth_verifier_enc: string | null;
  oauth_chat_id: string | null;
  oauth_expires_at: Date | null;
  oauth_meta: string | null;
};

type StoredToken = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  tokenType: string;
  scope: string;
  meta: OauthMeta;
  clientId: string;
  clientSecret: string;
};

const columns = `id, name, url, state, client_id, client_secret_enc, token_enc,
  oauth_state, oauth_verifier_enc, oauth_chat_id, oauth_expires_at, oauth_meta`;

export async function listConnections() {
  const result = await getPool().query<ConnectionRow>(
    `SELECT ${columns} FROM mcp_connections ORDER BY created_at ASC, name ASC`,
  );
  return result.rows.map(publicConnection);
}

export async function createConnection(input: {
  provider?: "gmail" | "notion";
  name?: string;
  url?: string;
}) {
  const known =
    input.provider === "gmail"
      ? { name: "Gmail", url: GMAIL_MCP_URL }
      : input.provider === "notion"
        ? { name: "Notion", url: NOTION_MCP_URL }
        : null;
  const name = (known?.name || input.name || "").trim();
  const url = known?.url || (await assertMcpUrl(input.url || ""));
  if (!name || name.length > 80) throw new AppError("Enter a name for this app.");
  const existing = await getPool().query<ConnectionRow>(
    `SELECT ${columns} FROM mcp_connections WHERE url = $1`,
    [url],
  );
  if (existing.rowCount) return publicConnection(existing.rows[0]);
  const id = randomUUID();
  await getPool().query(
    `INSERT INTO mcp_connections (id, name, url) VALUES ($1, $2, $3)`,
    [id, name, url],
  );
  return { id, name, url, state: "needs_auth" as const };
}

export async function disconnectConnection(id: string) {
  const result = await getPool().query(
    `UPDATE mcp_connections
     SET state = 'disconnected', token_enc = NULL, oauth_state = NULL,
         oauth_verifier_enc = NULL, oauth_chat_id = NULL, oauth_expires_at = NULL,
         oauth_meta = NULL, updated_at = now()
     WHERE id = $1`,
    [id],
  );
  if (!result.rowCount) throw new AppError("Connection not found.", 404);
}

export async function beginSignIn(input: {
  id: string;
  redirectUri: string;
  chatId?: string;
  clientId?: string;
  clientSecret?: string;
}) {
  const row = await requireRow(input.id);
  if (input.clientId) {
    await getPool().query(
      `UPDATE mcp_connections SET client_id = $2, updated_at = now() WHERE id = $1`,
      [row.id, input.clientId],
    );
    row.client_id = input.clientId;
  }
  if (input.clientSecret) {
    row.client_secret_enc = encryptSecret(input.clientSecret);
    await getPool().query(
      `UPDATE mcp_connections SET client_secret_enc = $2, updated_at = now() WHERE id = $1`,
      [row.id, row.client_secret_enc],
    );
  }
  const meta = await discoverOauth(row.url);
  let clientId = row.client_id || "";
  let clientSecret = row.client_secret_enc ? decryptSecret(row.client_secret_enc) : "";
  if (!clientId && meta.registrationEndpoint) {
    const registered = await registerClient({ meta, redirectUri: input.redirectUri });
    clientId = registered.clientId;
    if (registered.clientSecret) {
      clientSecret = registered.clientSecret;
      if (meta.authMethod === "none") meta.authMethod = "client_secret_post";
    }
    await getPool().query(
      `UPDATE mcp_connections
       SET client_id = $2, client_secret_enc = $3, updated_at = now()
       WHERE id = $1`,
      [row.id, clientId, clientSecret ? encryptSecret(clientSecret) : null],
    );
  }
  if (!clientId)
    throw new AppError("This server needs a client id.", 422, "client_id");
  if (meta.authMethod !== "none" && !clientSecret)
    throw new AppError(
      "This server needs a client secret.",
      422,
      "client_secret",
    );
  const state = newVerifier();
  const verifier = newVerifier();
  const savedMeta: OauthMeta = { ...meta };
  await getPool().query(
    `UPDATE mcp_connections
     SET oauth_state = $2, oauth_verifier_enc = $3, oauth_chat_id = $4,
         oauth_expires_at = now() + interval '10 minutes', oauth_meta = $5,
         updated_at = now()
     WHERE id = $1`,
    [
      row.id,
      state,
      encryptSecret(verifier),
      input.chatId || null,
      JSON.stringify(savedMeta),
    ],
  );
  return {
    url: buildAuthorizeUrl({
      meta,
      clientId,
      redirectUri: input.redirectUri,
      state,
      verifier,
    }),
  };
}

export async function finishSignIn(input: {
  state: string;
  code: string;
  redirectUri: string;
}) {
  const result = await getPool().query<ConnectionRow>(
    `SELECT ${columns} FROM mcp_connections WHERE oauth_state = $1`,
    [input.state],
  );
  const row = result.rows[0];
  if (!row?.oauth_verifier_enc || !row.oauth_meta || !row.oauth_expires_at)
    throw new AppError("Sign-in could not be completed.");
  if (new Date(row.oauth_expires_at).getTime() < Date.now())
    throw new AppError("Sign-in expired. Start it again.");
  const meta = JSON.parse(row.oauth_meta) as OauthMeta & { clientSecret?: string };
  const clientSecret =
    meta.clientSecret ||
    (row.client_secret_enc ? decryptSecret(row.client_secret_enc) : "");
  const token = await exchangeToken({
    meta,
    redirectUri: input.redirectUri,
    clientId: row.client_id || "",
    clientSecret,
    code: input.code,
    verifier: decryptSecret(row.oauth_verifier_enc),
  });
  await storeToken(row, token, meta, clientSecret);
  return { id: row.id, chatId: row.oauth_chat_id };
}

export async function markNeedsAuth(id: string) {
  await getPool().query(
    `UPDATE mcp_connections
     SET state = 'needs_auth', token_enc = NULL, updated_at = now()
     WHERE id = $1`,
    [id],
  );
}

export async function accessTokenFor(rowId: string) {
  const row = await requireRow(rowId);
  if (row.state !== "connected" || !row.token_enc)
    throw new AppError(`Sign in to ${row.name} to continue.`, 401);
  const stored = JSON.parse(decryptSecret(row.token_enc)) as StoredToken;
  if (stored.expiresAt > Date.now() + 60_000) return { row, token: stored.accessToken };
  if (!stored.refreshToken) {
    await markNeedsAuth(row.id);
    throw new AppError(`Sign in to ${row.name} to continue.`, 401);
  }
  try {
    const refreshed = await exchangeToken({
      meta: stored.meta,
      redirectUri: "",
      clientId: stored.clientId,
      clientSecret: stored.clientSecret,
      refreshToken: stored.refreshToken,
    });
    await storeToken(row, refreshed, stored.meta, stored.clientSecret);
    return { row, token: refreshed.accessToken };
  } catch (error) {
    await markNeedsAuth(row.id);
    throw error;
  }
}

async function storeToken(
  row: ConnectionRow,
  token: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    tokenType: string;
    scope: string;
  },
  meta: OauthMeta,
  clientSecret: string,
) {
  const stored: StoredToken = {
    ...token,
    meta,
    clientId: row.client_id || "",
    clientSecret,
  };
  await getPool().query(
    `UPDATE mcp_connections
     SET state = 'connected', token_enc = $2, oauth_state = NULL,
         oauth_verifier_enc = NULL, oauth_chat_id = NULL, oauth_expires_at = NULL,
         oauth_meta = NULL, updated_at = now()
     WHERE id = $1`,
    [row.id, encryptSecret(JSON.stringify(stored))],
  );
}

async function requireRow(id: string) {
  const result = await getPool().query<ConnectionRow>(
    `SELECT ${columns} FROM mcp_connections WHERE id = $1`,
    [id],
  );
  if (!result.rowCount) throw new AppError("Connection not found.", 404);
  return result.rows[0];
}

function publicConnection(row: ConnectionRow): PublicConnection {
  return { id: row.id, name: row.name, url: row.url, state: row.state };
}
