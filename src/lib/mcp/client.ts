import { AppError } from "../core";

export class NeedsAuth extends Error {
  constructor(
    readonly connectionId: string,
    readonly connectionName: string,
  ) {
    super(`Sign in to ${connectionName} to continue.`);
  }
}

export type RemoteTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  readOnly: boolean;
};

type Session = {
  url: string;
  token: string;
  sessionId: string;
  protocol: string;
};

export async function listRemoteTools(input: {
  url: string;
  token: string;
  connectionId: string;
  connectionName: string;
}) {
  const session = await openSession(input);
  const tools: RemoteTool[] = [];
  let cursor = "";
  for (let page = 0; page < 5; page += 1) {
    const listed = await rpc(session, "tools/list", cursor ? { cursor } : {}, input);
    const batch = Array.isArray(listed.result.tools) ? listed.result.tools : [];
    for (const item of batch) {
      if (!item || typeof item !== "object") continue;
      const tool = item as Record<string, unknown>;
      if (typeof tool.name !== "string" || !tool.name) continue;
      const annotations =
        tool.annotations && typeof tool.annotations === "object"
          ? (tool.annotations as Record<string, unknown>)
          : {};
      const schema =
        tool.inputSchema && typeof tool.inputSchema === "object"
          ? (tool.inputSchema as Record<string, unknown>)
          : { type: "object", additionalProperties: true };
      tools.push({
        name: tool.name,
        description:
          typeof tool.description === "string" ? tool.description.slice(0, 400) : "",
        inputSchema: schema,
        readOnly: annotations.readOnlyHint === true,
      });
    }
    cursor = typeof listed.result.nextCursor === "string" ? listed.result.nextCursor : "";
    if (!cursor) break;
  }
  return tools;
}

export async function callRemoteTool(input: {
  url: string;
  token: string;
  connectionId: string;
  connectionName: string;
  name: string;
  args: Record<string, unknown>;
}) {
  const session = await openSession(input);
  const called = await rpc(
    session,
    "tools/call",
    { name: input.name, arguments: input.args },
    input,
  );
  const content = Array.isArray(called.result.content) ? called.result.content : [];
  const text = content
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const part = item as Record<string, unknown>;
      return typeof part.text === "string" ? part.text : "";
    })
    .filter(Boolean)
    .join("\n")
    .slice(0, 16000);
  if (called.result.isError === true)
    throw new AppError(text.slice(0, 500) || "The MCP server rejected the call.");
  return text || "The tool returned no text.";
}

async function openSession(input: {
  url: string;
  token: string;
  connectionId: string;
  connectionName: string;
}) {
  const opened = await rpc(
    { url: input.url, token: input.token, sessionId: "", protocol: "2025-06-18" },
    "initialize",
    {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "Open Agent", version: "0.1.0" },
    },
    input,
  );
  const protocol =
    typeof opened.result.protocolVersion === "string"
      ? opened.result.protocolVersion
      : "2025-06-18";
  const session = {
    url: input.url,
    token: input.token,
    sessionId: opened.sessionId || "",
    protocol,
  };
  try {
    await notify(session, "notifications/initialized", input);
  } catch (error) {
    if (error instanceof NeedsAuth) throw error;
  }
  return session;
}

async function notify(
  session: Session,
  method: string,
  input: { connectionId: string; connectionName: string },
) {
  await post(session, { jsonrpc: "2.0", method }, input);
}

async function rpc(
  session: Session,
  method: string,
  params: Record<string, unknown>,
  input: { connectionId: string; connectionName: string },
) {
  const id = Math.floor(Math.random() * 1_000_000_000);
  const response = await post(
    session,
    { jsonrpc: "2.0", id, method, params },
    input,
  );
  const message = response.message;
  if (message && typeof message === "object" && "error" in message) {
    const error = (message as { error?: { message?: string } }).error;
    throw new AppError(
      error?.message?.slice(0, 180) || "The MCP server rejected the call.",
    );
  }
  const result =
    message && typeof message === "object"
      ? (message as { result?: Record<string, unknown> }).result
      : null;
  if (!result || typeof result !== "object")
    throw new AppError("The MCP server returned no result.");
  return { result, sessionId: response.sessionId };
}

async function post(
  session: Session,
  body: Record<string, unknown>,
  input: { connectionId: string; connectionName: string },
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${session.token}`,
    "MCP-Protocol-Version": session.protocol,
  };
  if (session.sessionId) headers["Mcp-Session-Id"] = session.sessionId;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(session.url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      redirect: "manual",
      signal: controller.signal,
    });
    if (response.status === 401) throw new NeedsAuth(input.connectionId, input.connectionName);
    if (response.status >= 300 && response.status < 400)
      throw new AppError("The MCP server redirected the call.");
    const text = (await response.text()).slice(0, 1_000_000);
    const type = response.headers.get("content-type") || "";
    const message = type.includes("text/event-stream")
      ? parseEvent(text, body.id)
      : parseJson(text);
    const rpc =
      message &&
      typeof message === "object" &&
      ("result" in message || "error" in message);
    if (response.status >= 400 && !rpc)
      throw new AppError("The MCP server rejected the call.");
    return {
      message,
      sessionId: response.headers.get("mcp-session-id") || session.sessionId,
    };
  } catch (error) {
    if (error instanceof NeedsAuth || error instanceof AppError) throw error;
    throw new AppError("Could not reach the MCP server.");
  } finally {
    clearTimeout(timer);
  }
}

function parseEvent(body: string, id: unknown) {
  for (const block of body.split("\n\n")) {
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (!data) continue;
    const message = parseJson(data);
    if (!message || typeof message !== "object") continue;
    if (id === undefined || (message as { id?: unknown }).id === id) return message;
  }
  return null;
}

function parseJson(body: string) {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}
