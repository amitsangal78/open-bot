import { describe, expect, it } from "vitest";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { preparePrompt, promptTokenCost } from "./context";
import { AppError, safeError } from "../core";

describe("chat input budgeting", () => {
  it("shortens research results while retaining every tool-call pair and the saved originals", () => {
    const user = new HumanMessage({
      id: "question",
      content: "Compare these sources and cite their URLs.",
    });
    const history = [
      user,
      ...Array.from({ length: 4 }, (_, i) => [
        new AIMessage({
          id: `ai-${i}`,
          content: "Reading a source.",
          tool_calls: [
            {
              id: `call-${i}`,
              name: "read_page",
              args: { url: `https://example.com/${i}` },
              type: "tool_call",
            },
          ],
        }),
        new ToolMessage({
          id: `result-${i}`,
          tool_call_id: `call-${i}`,
          name: "read_page",
          content: JSON.stringify({
            url: `https://example.com/${i}`,
            text: "A detailed research finding with useful context. ".repeat(
              2500,
            ),
          }),
        }),
      ]).flat(),
    ];
    const originals = history.map((m) => m.toDict());
    const result = preparePrompt(
      "System policy: use citations and require approval for writes.",
      history,
      900,
      3200,
    );
    expect(result.compacted).toBe(true);
    expect(result.estimatedTokens).toBeLessThanOrEqual(3200);
    expect(result.messages).toContain(user);
    const calls = result.messages
      .flatMap((m) => (m as AIMessage).tool_calls || [])
      .map((c) => c.id);
    const replies = result.messages
      .filter((m) => m.getType() === "tool")
      .map((m) => (m as ToolMessage).tool_call_id);
    expect(replies).toEqual(calls);
    expect(
      result.messages
        .filter((m) => m.getType() === "tool")
        .every((m) =>
          String(m.content).includes("full result remains in saved history"),
        ),
    ).toBe(true);
    expect(history.map((m) => m.toDict())).toEqual(originals);
  });
  it("removes whole older turns and preserves the exact newest user message", () => {
    const latest = new HumanMessage({
      id: "latest",
      content: "Please focus on the latest question.",
    });
    const history = [
      new HumanMessage({ id: "old", content: "Old question" }),
      new AIMessage({ content: "An old answer. ".repeat(5000) }),
      latest,
    ];
    const result = preparePrompt("Policy", history, 500, 2000);
    expect(result.messages.map((m) => m.id)).not.toContain("old");
    expect(result.messages.at(-1)).toBe(latest);
  });
  it("leaves short conversations unchanged", () => {
    const history = [new HumanMessage("Hello")];
    const result = preparePrompt("Policy", history, 500, 2000);
    expect(result.compacted).toBe(false);
    expect(result.messages[1]).toBe(history[0]);
    expect(promptTokenCost(new SystemMessage("Policy"), history, 500)).toBe(
      result.estimatedTokens,
    );
  });
  it("rejects an unavoidably oversized user message without silently cutting it", () => {
    const message = new HumanMessage(
      "A user request with important details. ".repeat(4000),
    );
    const original = message.content;
    expect(() => preparePrompt("Policy", [message], 500, 2000)).toThrow(
      AppError,
    );
    expect(message.content).toBe(original);
  });
  it("explains provider HTTP 413 errors without exposing the provider payload", () => {
    const error = Object.assign(
      new Error("413 Request too large: private request details"),
      { status: 413 },
    );
    expect(safeError(error)).toContain("input-token limit");
    expect(safeError(error)).not.toContain("private request details");
  });
});
