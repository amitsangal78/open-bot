export type SummaryDraft = {
  title: string;
  text: string;
};

export function wantsDocYardShare(text: string) {
  const source = text.trim();
  if (!source || source.includes("?")) return false;
  if (!/\b(?:share|send|submit)\b/i.test(source)) return false;
  return /\b(?:summary|docyard|chat|conversation)\b/i.test(source);
}

export function draftSummary(
  title: string,
  messages: { role: string; content: string }[],
): SummaryDraft | null {
  const lines = messages
    .filter(
      (message) =>
        (message.role === "user" || message.role === "assistant") &&
        message.content.trim(),
    )
    .map((message) => {
      const who = message.role === "user" ? "You" : "Assistant";
      return `${who}: ${message.content.trim().slice(0, 2000)}`;
    });
  const text = lines.join("\n\n").slice(0, 20000).trim();
  if (!text) return null;
  const name = title.trim().slice(0, 300) || "Chat summary";
  return { title: name, text };
}

export function summaryChange(draft: SummaryDraft) {
  return `Share this summary with DocYard:\n\n${draft.title}\n\n${draft.text}`;
}
