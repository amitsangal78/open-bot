import { describe, expect, it } from "vitest";
import { proposedSchedule, scheduleChange, scheduleUpdate } from "./propose";

describe("schedule proposals", () => {
  it("turns an explicit schedule request into the card text", () => {
    const proposal = proposedSchedule(
      "Schedule every Monday at 9am to summarize my unread Gmail.",
    );
    expect(proposal).toEqual({
      name: "Summarize my unread Gmail",
      time: "09:00",
      weekdays: ["monday"],
      prompt: "summarize my unread Gmail",
    });
    expect(scheduleChange(proposal!)).toBe(
      "Create this schedule:\n\nName: Summarize my unread Gmail\nDays: Monday\nTime: 09:00\nPrompt:\nsummarize my unread Gmail",
    );
  });

  it("reads a named weekday reminder", () => {
    expect(
      proposedSchedule(
        "Remind me every weekday at 8:30 to check Notion.",
      ),
    ).toEqual({
      name: "Check Notion",
      time: "08:30",
      weekdays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
      prompt: "check Notion",
    });
  });

  it("keeps a one-time question as a question", () => {
    expect(proposedSchedule("What is on my calendar Monday at 9am?")).toBeNull();
    expect(proposedSchedule("Summarize my unread Gmail.")).toBeNull();
    expect(proposedSchedule("Remember in MEMORY.md that I drink tea.")).toBeNull();
  });

  it("accepts a tool call only when the schedule is complete", () => {
    expect(
      scheduleUpdate(
        JSON.stringify({
          name: "Morning mail",
          time: "09:00",
          weekdays: ["monday"],
          prompt: "Summarize unread mail.",
        }),
      )?.name,
    ).toBe("Morning mail");
    expect(scheduleUpdate('{"name":"Morning mail"}')).toBeNull();
  });
});
