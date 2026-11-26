import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { convertToOpenAITool } from "@langchain/core/utils/function_calling";
import { Tiktoken } from "js-tiktoken/lite";
import ranks from "js-tiktoken/ranks/cl100k_base";
import { AppError } from "../core";

// All tokenizer data is bundled locally. No network or model calls are used.
// This is an estimate for non-OpenAI tokenizers; leave headroom below provider limits.
const encoding = new Tiktoken(ranks);
const OMITTED =
  "\n[Excerpt shortened to fit the model request; full result remains in saved history.]\n";
export const tokens = (text: string) => encoding.encode(text, [], []).length;
export function clipText(text: string, limit: number): string {
  const encoded = encoding.encode(text, [], []);
  if (encoded.length <= limit) return text;
  const remaining = Math.max(0, limit - tokens(OMITTED));
  const head = Math.ceil(remaining * 0.75),
    tail = remaining - head;
  return (
    encoding.decode(encoded.slice(0, head)) +
    OMITTED +
    (tail ? encoding.decode(encoded.slice(-tail)) : "")
  );
}
function textOf(message: BaseMessage) {
  return typeof message.content === "string"
    ? message.content
    : JSON.stringify(message.content);
}
function copyWithText(message: BaseMessage, content: string): BaseMessage {
  const shared = { id: message.id, name: message.name, content };
  switch (message.getType()) {
    case "tool":
      return new ToolMessage({
        ...shared,
        tool_call_id: (message as ToolMessage).tool_call_id,
      });
    case "ai":
      return new AIMessage({
        ...shared,
        tool_calls: (message as AIMessage).tool_calls,
      });
    case "human":
      return new HumanMessage(shared);
    case "system":
      return new SystemMessage(shared);
    default:
      throw new AppError("Unsupported conversation message type.");
  }
}
export function toolTokenCost(tools: StructuredToolInterface[]) {
  return tokens(JSON.stringify(tools.map((t) => convertToOpenAITool(t)))) + 100;
}
export function promptTokenCost(
  system: BaseMessage,
  messages: BaseMessage[],
  toolCost: number,
) {
  return (
    toolCost +
    [system, ...messages].reduce(
      (total, message) =>
        total +
        12 +
        tokens(textOf(message)) +
        tokens(JSON.stringify((message as AIMessage).tool_calls || [])),
      0,
    )
  );
}
export function inputTokenBudget() {
  const configured = Number(process.env.AI_MAX_INPUT_TOKENS || "5500");
  return Number.isFinite(configured)
    ? Math.max(1000, Math.min(100000, Math.floor(configured)))
    : 5500;
}
export function preparePrompt(
  systemText: string,
  history: BaseMessage[],
  toolCost: number,
  budget = inputTokenBudget(),
) {
  let system = new SystemMessage(systemText);
  let messages = [...history];
  const estimate = () => promptTokenCost(system, messages, toolCost);
  const originalTokens = estimate();
  if (originalTokens <= budget)
    return {
      messages: [system, ...messages],
      estimatedTokens: originalTokens,
      compacted: false,
    };

  // Drop complete older turns, preserving the latest user request and all of its
  // tool-call/result pairs. Never modify persisted graph messages or tool arguments.
  let latestUser = -1;
  for (let i = 0; i < messages.length; i++)
    if (messages[i].getType() === "human") latestUser = i;
  if (latestUser > 0) {
    messages = messages.slice(latestUser);
    systemText +=
      "\nEarlier conversation turns were omitted to fit the input budget. Do not assume their contents; ask the user if those details are needed.";
    system = new SystemMessage(systemText);
  }

  // Preserve recent source material more generously. Retain a small excerpt from
  // every older result so the model knows what was checked and can cite URLs.
  for (const limit of [1200, 600, 300, 128]) {
    if (estimate() <= budget) break;
    const lastTool = messages.findLastIndex((m) => m.getType() === "tool");
    messages = messages.map((message, index) => {
      if (message.getType() === "tool")
        return copyWithText(
          message,
          clipText(textOf(message), index === lastTool ? limit * 2 : limit),
        );
      if (message.getType() === "ai")
        return copyWithText(message, clipText(textOf(message), 256));
      return message;
    });
  }
  // The policy is at the front of the system prompt; shorten appended memory and
  // skill descriptions only if source compaction alone cannot meet the budget.
  if (estimate() > budget) {
    const available = budget - (estimate() - tokens(textOf(system)));
    if (available >= 700)
      system = new SystemMessage(clipText(systemText, available));
  }
  if (estimate() > budget)
    throw new AppError(
      "This message and its tool definitions exceed the input budget. Shorten the message or memory, or start a new conversation.",
      413,
    );
  return {
    messages: [system, ...messages],
    estimatedTokens: estimate(),
    compacted: true,
  };
}
