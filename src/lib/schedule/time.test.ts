import { describe, expect, it } from "vitest";
import { addDays, dueActions, initialCheckedOn } from "./time";

describe("schedule days", () => {
  it("adds calendar days", () => {
    expect(addDays("2026-11-23", 1)).toBe("2026-11-24");
    expect(addDays("2026-11-23", -1)).toBe("2026-11-22");
  });

  it("runs inside the grace window and misses a later start", () => {
    const onTime = dueActions({
      now: new Date("2026-11-23T03:30:10Z"),
      timeZone: "Asia/Kolkata",
      time: "09:00",
      weekdays: ["monday"],
      checkedOn: "2026-11-22",
      status: "active",
    });
    expect(onTime.actions).toEqual([{ date: "2026-11-23", action: "run" }]);

    const late = dueActions({
      now: new Date("2026-11-23T04:10:00Z"),
      timeZone: "Asia/Kolkata",
      time: "09:00",
      weekdays: ["monday"],
      checkedOn: "2026-11-22",
      status: "active",
    });
    expect(late.actions).toEqual([{ date: "2026-11-23", action: "miss" }]);
  });

  it("does not collect a day while the schedule is paused", () => {
    const paused = dueActions({
      now: new Date("2026-11-23T04:10:00Z"),
      timeZone: "Asia/Kolkata",
      time: "09:00",
      weekdays: ["monday"],
      checkedOn: "2026-11-22",
      status: "paused",
    });
    expect(paused.actions).toEqual([]);
    expect(paused.checkedOn).toBe("2026-11-23");
  });

  it("leaves today open when the schedule is created before its time", () => {
    expect(
      initialCheckedOn(new Date("2026-11-23T03:00:00Z"), "Asia/Kolkata", "09:00", ["monday"]),
    ).toBe("2026-11-22");
  });
});
