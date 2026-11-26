import { describe, expect, it } from "vitest";
import { draftSummary, summaryChange, wantsDocYardShare } from "./summary";

describe("DocYard summaries", () => {
  it("asks for confirmation only when the person wants to share this chat", () => {
    expect(wantsDocYardShare("Share a summary of this chat with DocYard.")).toBe(true);
    expect(wantsDocYardShare("Summarize my unread Gmail.")).toBe(false);
    expect(wantsDocYardShare("What is in this chat?")).toBe(false);
  });

  it("drafts the summary from this conversation only", () => {
    const draft = draftSummary("Hello", [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there." },
      { role: "tool", content: "hidden" },
    ]);
    expect(draft).toEqual({
      title: "Hello",
      text: "You: Hello\n\nAssistant: Hi there.",
    });
    expect(summaryChange(draft!)).toContain("Share this summary with DocYard:");
    expect(summaryChange(draft!)).toContain("Hi there.");
    expect(summaryChange(draft!)).not.toContain("hidden");
  });
});
