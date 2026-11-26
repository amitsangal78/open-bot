import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { encryptSecret, decryptSecret } from "../secrets";
import { connectTarget, mentionedConnections } from "./match";
import { buildAuthorizeUrl, codeChallenge, type OauthMeta } from "./oauth";
import { modelToolName } from "./turn";

const meta: OauthMeta = {
  authorizationEndpoint: "https://mcp.notion.com/authorize",
  tokenEndpoint: "https://mcp.notion.com/token",
  registrationEndpoint: "",
  resource: "https://mcp.notion.com/mcp",
  scope: "",
  authMethod: "none",
  allowLocal: false,
};

describe("mcp sign-in helpers", () => {
  it("builds one PKCE authorization URL", () => {
    const url = new URL(
      buildAuthorizeUrl({
        meta,
        clientId: "client",
        redirectUri: "http://127.0.0.1:3000/api/connections/callback",
        state: "state",
        verifier: "verifier",
      }),
    );
    expect(url.searchParams.getAll("resource")).toEqual(["https://mcp.notion.com/mcp"]);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(codeChallenge("verifier"));
    expect(url.searchParams.get("client_secret")).toBeNull();
  });

  it("matches an app by @ or by its name", () => {
    const connections = [
      { id: "1", name: "Gmail", state: "connected" },
      { id: "2", name: "Notion", state: "needs_auth" },
    ];
    expect(mentionedConnections("Check @Gmail today", connections).map((item) => item.name)).toEqual([
      "Gmail",
    ]);
    expect(mentionedConnections("What is in Notion?", connections).map((item) => item.id)).toEqual([
      "2",
    ]);
  });

  it("reads the connect card from the saved message", () => {
    expect(
      connectTarget([
        {
          role: "assistant",
          toolCalls: JSON.stringify([
            {
              id: "connect-1",
              type: "function",
              function: {
                name: "connect",
                arguments: JSON.stringify({ id: "1", name: "Gmail" }),
              },
            },
          ]),
        },
      ]),
    ).toEqual({ id: "1", name: "Gmail" });
  });

  it("keeps model tool names free of spaces", () => {
    expect(modelToolName("123e4567-e89b-12d3-a456-426614174000", "search emails")).toBe(
      "mcp_123e4567_search_emails",
    );
  });

  it("encrypts a token so the stored text is not the token", () => {
    const dir = mkdtempSync(join(tmpdir(), "open-agent-"));
    const previous = process.env.DATA_DIR;
    process.env.DATA_DIR = dir;
    try {
      const stored = encryptSecret("access-token");
      expect(stored).not.toContain("access-token");
      expect(decryptSecret(stored)).toBe("access-token");
    } finally {
      if (previous === undefined) delete process.env.DATA_DIR;
      else process.env.DATA_DIR = previous;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
