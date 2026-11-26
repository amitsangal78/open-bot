import { describe, expect, it } from "vitest";
import {
  clipWords,
  completionsUrl,
  failureText,
  memoryChange,
  memoryUpdate,
  proposedMemory,
  prepareResume,
  splitChats,
  MODEL_FAILURE,
} from "./prompt";

describe("chat helpers", () => {
  it("stops a reply at 1000 words", () => {
    const words = Array.from({ length: 1002 }, (_, index) => `word${index}`);
    const clipped = clipWords(words.join(" "));
    expect(clipped.split(/\s+/)).toHaveLength(1000);
    expect(clipped.endsWith("word999")).toBe(true);
    expect(clipWords("A short answer.")).toBe("A short answer.");
  });

  it("turns a bare model address into the chat completions URL", () => {
    expect(completionsUrl("http://127.0.0.1:8000")).toBe(
      "http://127.0.0.1:8000/v1/chat/completions",
    );
    expect(completionsUrl("http://127.0.0.1:8000/v1")).toBe(
      "http://127.0.0.1:8000/v1/chat/completions",
    );
  });

  it("keeps the newest ten chats and archives the rest", () => {
    const chats = Array.from({ length: 12 }, (_, index) => index + 1);
    expect(splitChats(chats)).toEqual({
      recent: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      archive: [11, 12],
    });
  });

  it("keeps a partial reply and states that the model failed", () => {
    expect(failureText("")).toBe(MODEL_FAILURE);
    expect(failureText("Half an answer")).toBe(
      `Half an answer\n\n${MODEL_FAILURE}`,
    );
  });

  it("shows the exact memory text that an approval must accept", () => {
    const update = memoryUpdate(
      JSON.stringify({ file: "MEMORY.md", content: "Amit likes tea." }),
    );
    expect(update).toEqual({ file: "MEMORY.md", content: "Amit likes tea." });
    expect(memoryChange(update!)).toBe(
      "Replace MEMORY.md with:\n\nAmit likes tea.",
    );
    expect(memoryUpdate('{"file":"notes","content":"x"}')).toBeNull();
  });

  it("turns a remember request into the exact file the card will show", () => {
    expect(
      proposedMemory("Remember in MEMORY.md that I drink tea.", {
        user: "# User\n",
        notes: "# Assistant memory\n",
      }),
    ).toEqual({
      file: "MEMORY.md",
      content: "# Assistant memory\n\nI drink tea.\n",
    });
  });

  it("drops a failed reply so resume can try the same question again", () => {
    const prepared = prepareResume([
      { id: "u", role: "user", content: "Hello" },
      { id: "a", role: "assistant", content: MODEL_FAILURE },
    ]);
    expect(prepared.messages.map((message) => message.content)).toEqual(["Hello"]);
    expect(prepared.continuePartial).toBe(false);
  });
});
