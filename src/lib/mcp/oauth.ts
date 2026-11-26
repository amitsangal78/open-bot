import { createHash, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { AppError } from "../core";
import { publicAddress } from "../web";

export const GMAIL_MCP_URL = "https://gmailmcp.googleapis.com/mcp/v1";
export const NOTION_MCP_URL = "https://mcp.notion.com/mcp";

export type AuthMethod = "none" | "client_secret_post" | "client_secret_basic";

export type OauthMeta = {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint: string;
  resource: string;
  scope: string;
  authMethod: AuthMethod;
  allowLocal: boolean;
};

export function codeChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function newVerifier() {
  return randomBytes(32).toString("base64url");
}

export function buildAuthorizeUrl(input: {
  meta: OauthMeta;
  clientId: string;
  redirectUri: string;
  state: string;
  verifier: string;
}) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    code_challenge: codeChallenge(input.verifier),
    code_challenge_method: "S256",
    state: input.state,
    resource: input.meta.resource,
  });
  if (input.meta.scope) params.set("scope", input.meta.scope);
  const endpoint = new URL(input.meta.authorizationEndpoint);
  if (endpoint.hostname === "accounts.google.com") {
    params.set("access_type", "offline");
    params.set("prompt", "consent");
  }
  return `${input.meta.authorizationEndpoint}?${params.toString()}`;
}

export async function assertMcpUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new AppError("Enter a server address.");
  }
  if (url.username || url.password)
    throw new AppError("The server address cannot include a password.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const local = host === "localhost" || host === "127.0.0.1";
  if (local) {
    if (!["http:", "https:"].includes(url.protocol))
      throw new AppError("Use http or https for a local MCP server.");
    return url.toString();
  }
  if (url.protocol !== "https:")
    throw new AppError("A remote MCP server must use https.");
  await assertPublicHost(host);
  return url.toString();
}

export async function discoverOauth(serverUrl: string): Promise<OauthMeta> {
  const server = new URL(serverUrl);
  const allowLocal = ["localhost", "127.0.0.1"].includes(server.hostname);
  const probed = await fetchText(serverUrl, { method: "POST", allowLocal });
  const header = probed.headers.get("www-authenticate") || "";
  const advertised = header.match(/resource_metadata="([^"]+)"/)?.[1];
  const metadataUrls = [
    advertised,
    wellKnown(server, "/.well-known/oauth-protected-resource"),
    new URL("/.well-known/oauth-protected-resource", server.origin).toString(),
  ].filter((url): url is string => Boolean(url));
  let resourceDoc: Record<string, unknown> | null = null;
  for (const url of metadataUrls) {
    const response = await fetchText(url, { allowLocal });
    if (response.status !== 200) continue;
    resourceDoc = readJson(response.body);
    if (resourceDoc) break;
  }
  const resource =
    typeof resourceDoc?.resource === "string" ? resourceDoc.resource : serverUrl;
  const issuers = Array.isArray(resourceDoc?.authorization_servers)
    ? resourceDoc.authorization_servers.filter(
        (issuer): issuer is string => typeof issuer === "string",
      )
    : [new URL(serverUrl).origin];
  const scopes = Array.isArray(resourceDoc?.scopes_supported)
    ? resourceDoc.scopes_supported.filter(
        (scope): scope is string =>
          typeof scope === "string" && scope.length < 200 && !/\s/.test(scope),
      )
    : [];
  for (const issuer of issuers) {
    const doc = await authorizationMetadata(issuer, allowLocal);
    if (!doc) continue;
    const authorizationEndpoint = stringField(doc, "authorization_endpoint");
    const tokenEndpoint = stringField(doc, "token_endpoint");
    if (!authorizationEndpoint || !tokenEndpoint) continue;
    await assertEndpoint(authorizationEndpoint, allowLocal);
    await assertEndpoint(tokenEndpoint, allowLocal);
    const registrationEndpoint = stringField(doc, "registration_endpoint");
    if (registrationEndpoint) await assertEndpoint(registrationEndpoint, allowLocal);
    return {
      authorizationEndpoint,
      tokenEndpoint,
      registrationEndpoint,
      resource,
      scope: scopes.slice(0, 20).join(" "),
      authMethod: authMethod(doc),
      allowLocal,
    };
  }
  throw new AppError("This MCP server did not publish a sign-in configuration.");
}

export async function registerClient(input: {
  meta: OauthMeta;
  redirectUri: string;
}) {
  if (!input.meta.registrationEndpoint)
    throw new AppError(
      "This server needs a client id.",
      422,
      "client_id",
    );
  const response = await fetchText(input.meta.registrationEndpoint, {
    method: "POST",
    allowLocal: input.meta.allowLocal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Open Agent",
      redirect_uris: [input.redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });
  const doc = readJson(response.body);
  const clientId = doc && typeof doc.client_id === "string" ? doc.client_id : "";
  if (response.status >= 400 || !clientId)
    throw new AppError("This server needs a client id.", 422, "client_id");
  const clientSecret =
    typeof doc?.client_secret === "string" ? doc.client_secret : "";
  return { clientId, clientSecret };
}

export async function exchangeToken(input: {
  meta: OauthMeta;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
  code?: string;
  verifier?: string;
  refreshToken?: string;
}) {
  const body = new URLSearchParams({
    grant_type: input.refreshToken ? "refresh_token" : "authorization_code",
    client_id: input.clientId,
    resource: input.meta.resource,
  });
  if (input.refreshToken) body.set("refresh_token", input.refreshToken);
  else {
    body.set("code", input.code || "");
    body.set("redirect_uri", input.redirectUri);
    body.set("code_verifier", input.verifier || "");
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  if (input.meta.authMethod === "client_secret_basic") {
    headers.Authorization = `Basic ${Buffer.from(
      `${input.clientId}:${input.clientSecret}`,
    ).toString("base64")}`;
  } else if (input.meta.authMethod === "client_secret_post" && input.clientSecret) {
    body.set("client_secret", input.clientSecret);
  }
  const response = await fetchText(input.meta.tokenEndpoint, {
    method: "POST",
    allowLocal: input.meta.allowLocal,
    headers,
    body,
  });
  const doc = readJson(response.body);
  const accessToken =
    doc && typeof doc.access_token === "string" ? doc.access_token : "";
  if (response.status >= 400 || !accessToken) {
    const code = doc && typeof doc.error === "string" ? doc.error : "";
    const safe = /^[a-z0-9_-]{1,40}$/i.test(code) ? ` (${code})` : "";
    throw new AppError(`Sign-in could not be completed${safe}.`);
  }
  const expiresIn =
    typeof doc?.expires_in === "number" ? doc.expires_in : 3600;
  return {
    accessToken,
    refreshToken:
      typeof doc?.refresh_token === "string" ? doc.refresh_token : input.refreshToken || "",
    expiresAt: Date.now() + expiresIn * 1000,
    tokenType: typeof doc?.token_type === "string" ? doc.token_type : "Bearer",
    scope: typeof doc?.scope === "string" ? doc.scope : input.meta.scope,
  };
}

async function authorizationMetadata(issuer: string, allowLocal: boolean) {
  let url: URL;
  try {
    url = new URL(issuer);
  } catch {
    return null;
  }
  const path = url.pathname.replace(/\/$/, "");
  const candidates = [
    `${url.origin}/.well-known/oauth-authorization-server${path}`,
    `${url.origin}${path}/.well-known/openid-configuration`,
    `${url.origin}/.well-known/openid-configuration`,
  ];
  for (const candidate of candidates) {
    const response = await fetchText(candidate, { allowLocal });
    if (response.status !== 200) continue;
    const doc = readJson(response.body);
    if (doc?.authorization_endpoint && doc.token_endpoint) return doc;
  }
  return null;
}

function authMethod(doc: Record<string, unknown>): AuthMethod {
  const methods = Array.isArray(doc.token_endpoint_auth_methods_supported)
    ? doc.token_endpoint_auth_methods_supported
    : ["client_secret_basic"];
  if (methods.includes("none")) return "none";
  if (methods.includes("client_secret_post")) return "client_secret_post";
  return "client_secret_basic";
}

function wellKnown(server: URL, suffix: string) {
  const path = server.pathname.replace(/\/$/, "");
  return `${server.origin}${suffix}${path}`;
}

function stringField(doc: Record<string, unknown>, key: string) {
  return typeof doc[key] === "string" ? doc[key] : "";
}

function readJson(body: string) {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function assertEndpoint(value: string, allowLocal: boolean) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError("This MCP server published an invalid sign-in address.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const local = host === "localhost" || host === "127.0.0.1";
  if (local) {
    if (!allowLocal || !["http:", "https:"].includes(url.protocol))
      throw new AppError("This MCP server published an invalid sign-in address.");
    return;
  }
  if (url.protocol !== "https:")
    throw new AppError("This MCP server published an invalid sign-in address.");
  await assertPublicHost(host);
}

async function assertPublicHost(host: string) {
  if (ipLiteral(host)) {
    if (!publicAddress(host))
      throw new AppError("That server address is not a public host.");
    return;
  }
  const addresses = await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((item) => !publicAddress(item.address)))
    throw new AppError("That server address is not a public host.");
}

function ipLiteral(host: string) {
  return /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":");
}

async function fetchText(
  url: string,
  input: {
    method?: string;
    allowLocal: boolean;
    headers?: Record<string, string>;
    body?: string | URLSearchParams;
  },
) {
  await assertEndpoint(url, input.allowLocal);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      method: input.method || "GET",
      headers: input.headers,
      body: input.body,
      redirect: "manual",
      signal: controller.signal,
    });
    if (response.status >= 300 && response.status < 400)
      throw new AppError("The MCP server redirected sign-in. Try the address again.");
    const body = (await response.text()).slice(0, 100_000);
    return { status: response.status, headers: response.headers, body };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Could not reach the MCP server.");
  } finally {
    clearTimeout(timer);
  }
}
