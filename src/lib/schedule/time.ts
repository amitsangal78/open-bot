export const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return utc.toISOString().slice(0, 10);
}

export function zonedNow(date: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "long",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday.toLowerCase(),
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

export function weekdayOf(date: string, timeZone: string) {
  const [year, month, day] = date.split("-").map(Number);
  return zonedNow(new Date(Date.UTC(year, month - 1, day, 12)), timeZone).weekday;
}

export function minutesOf(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export function dueActions(input: {
  now: Date;
  timeZone: string;
  time: string;
  weekdays: string[];
  checkedOn: string;
  status: "active" | "paused" | "cancelled";
  graceMinutes?: number;
}) {
  if (input.status === "cancelled")
    return { actions: [] as { date: string; action: "run" | "miss" }[], checkedOn: input.checkedOn };
  const grace = input.graceMinutes ?? 2;
  const due = minutesOf(input.time);
  const today = zonedNow(input.now, input.timeZone);
  const actions: { date: string; action: "run" | "miss" }[] = [];
  let settled = input.checkedOn;
  let day = addDays(input.checkedOn, 1);
  while (day <= today.date) {
    const scheduled = input.weekdays.includes(weekdayOf(day, input.timeZone));
    if (scheduled) {
      const future = day === today.date && today.minutes < due;
      if (future) break;
      const ready =
        day === today.date && today.minutes >= due && today.minutes <= due + grace;
      if (input.status === "active")
        actions.push({ date: day, action: ready ? "run" : "miss" });
    }
    settled = day;
    day = addDays(day, 1);
  }
  return { actions, checkedOn: settled };
}

export function initialCheckedOn(now: Date, timeZone: string, time: string, weekdays: string[]) {
  const current = zonedNow(now, timeZone);
  const dueLater =
    weekdays.includes(current.weekday) && current.minutes < minutesOf(time);
  return dueLater ? addDays(current.date, -1) : current.date;
}
