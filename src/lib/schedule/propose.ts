import { WEEKDAYS, type Weekday } from "./time";

export type ScheduleProposal = {
  name: string;
  time: string;
  weekdays: Weekday[];
  prompt: string;
};

const LABELS: Record<Weekday, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

const DAY =
  "mon(?:day)?s?|tues(?:day)?s?|tue(?:sday)?s?|wed(?:nesday)?s?|thu(?:rs(?:day)?)?s?|fri(?:day)?s?|sat(?:urday)?s?|sun(?:day)?s?";

export function scheduleChange(input: ScheduleProposal) {
  const days = input.weekdays.map((day) => LABELS[day]).join(", ");
  return `Create this schedule:\n\nName: ${input.name}\nDays: ${days}\nTime: ${input.time}\nPrompt:\n${input.prompt}`;
}

export function scheduleUpdate(raw: string): ScheduleProposal | null {
  try {
    const parsed = JSON.parse(raw) as {
      name?: unknown;
      time?: unknown;
      weekdays?: unknown;
      prompt?: unknown;
    };
    if (!Array.isArray(parsed.weekdays)) return null;
    return validSchedule({
      name: String(parsed.name ?? ""),
      time: String(parsed.time ?? ""),
      weekdays: parsed.weekdays.map(String) as Weekday[],
      prompt: String(parsed.prompt ?? ""),
    });
  } catch {
    return null;
  }
}

export function proposedSchedule(text: string): ScheduleProposal | null {
  const source = text.trim();
  if (!source || source.length > 2000 || source.includes("?")) return null;
  if (!hasScheduleIntent(source)) return null;
  const time = readTime(source);
  if (!time) return null;
  const weekdays = readWeekdays(source);
  if (!weekdays.length) return null;
  const named = source.match(
    /\b(?:called|named)\s+["']([^"']+)["']|\b(?:called|named)\s+(.+?)(?=\s+(?:every|on|at|for)\b|:)/i,
  );
  const prompt = readPrompt(source, time.index + time.length);
  if (!prompt || prompt.length > 8000) return null;
  const name = (named?.[1] || named?.[2] || titleFrom(prompt)).trim().slice(0, 80);
  return validSchedule({ name, time: time.value, weekdays, prompt });
}

function validSchedule(input: ScheduleProposal): ScheduleProposal | null {
  const name = input.name.trim();
  const prompt = input.prompt.trim();
  const time = input.time.trim();
  const weekdays = [...new Set(input.weekdays)];
  if (!name || name.length > 80) return null;
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  if (!weekdays.length || weekdays.some((day) => !WEEKDAYS.includes(day))) return null;
  if (!prompt || prompt.length > 8000) return null;
  return { name, time, weekdays, prompt };
}

function hasScheduleIntent(text: string) {
  if (/\b(?:schedule|schedules|scheduled|remind|reminder|reminders)\b/i.test(text))
    return true;
  return new RegExp(
    `^(?:please\\s+)?(?:every\\s+day|everyday|each\\s+day|daily|every\\s+(?:weekdays?|weekends?|${DAY}))\\b`,
    "i",
  ).test(text);
}

function readTime(text: string) {
  const clock = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\s*(am|pm)?\b/i);
  if (clock) {
    const value = to24(Number(clock[1]), Number(clock[2]), clock[3]?.toLowerCase());
    return value
      ? { value, index: clock.index ?? 0, length: clock[0].length }
      : null;
  }
  const spoken = text.match(/\b(1[0-2]|0?[1-9])\s*(am|pm)\b/i);
  if (!spoken) return null;
  const value = to24(Number(spoken[1]), 0, spoken[2].toLowerCase());
  return value
    ? { value, index: spoken.index ?? 0, length: spoken[0].length }
    : null;
}

function to24(hour: number, minute: number, suffix?: string) {
  if (!suffix) {
    if (hour > 23) return null;
    return pad(hour, minute);
  }
  if (hour < 1 || hour > 12) return null;
  const base = hour % 12;
  return pad(suffix === "pm" ? base + 12 : base, minute);
}

function pad(hour: number, minute: number) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function readWeekdays(text: string): Weekday[] {
  const found = new Set<Weekday>();
  const re = new RegExp(`\\b(${DAY})\\b`, "gi");
  for (const match of text.matchAll(re)) {
    const day = canonical(match[1]);
    if (day) found.add(day);
  }
  if (found.size) return WEEKDAYS.filter((day) => found.has(day));
  if (/\bweekends?\b/i.test(text)) return ["saturday", "sunday"];
  if (/\bweekdays?\b/i.test(text))
    return ["monday", "tuesday", "wednesday", "thursday", "friday"];
  if (/\b(?:every\s+day|everyday|each\s+day|daily)\b/i.test(text)) return [...WEEKDAYS];
  return [];
}

function canonical(word: string): Weekday | null {
  const value = word.toLowerCase();
  if (value.startsWith("mon")) return "monday";
  if (value.startsWith("tue")) return "tuesday";
  if (value.startsWith("wed")) return "wednesday";
  if (value.startsWith("thu")) return "thursday";
  if (value.startsWith("fri")) return "friday";
  if (value.startsWith("sat")) return "saturday";
  if (value.startsWith("sun")) return "sunday";
  return null;
}

function readPrompt(text: string, afterTime: number) {
  const after = text.slice(afterTime);
  const colon = after.match(/:\s*([\s\S]+)$/);
  if (colon?.[1]?.trim()) return cleanPrompt(colon[1]);
  const to = after.match(/\bto\s+([\s\S]+)$/i);
  if (to?.[1]?.trim()) return cleanPrompt(to[1]);
  const stripped = text
    .replace(/\b(?:please\s+)?(?:create|add|make|set\s+up|setup)?\s*(?:a\s+)?(?:schedule|schedules|scheduled|reminder|reminders)\b/gi, " ")
    .replace(/\bremind\s+me\b/gi, " ")
    .replace(/\b(?:called|named)\s+["'][^"']+["']/gi, " ")
    .replace(/\b(?:called|named)\s+.+?(?=\s+(?:every|on|at|for)\b|:)/gi, " ")
    .replace(new RegExp(`\\b(?:every|each|on)\\s+(?:day|weekdays?|weekends?|${DAY})\\b`, "gi"), " ")
    .replace(/\b(?:every\s+day|everyday|each\s+day|daily|weekdays?|weekends?)\b/gi, " ")
    .replace(new RegExp(`\\b(?:${DAY})\\b`, "gi"), " ")
    .replace(/\b(?:at\s+)?(?:[01]?\d|2[0-3]):[0-5]\d\s*(?:am|pm)?\b/gi, " ")
    .replace(/\b(?:at\s+)?(?:1[0-2]|0?[1-9])\s*(?:am|pm)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleanPrompt(stripped);
}

function cleanPrompt(value: string) {
  return value.replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, "").trim();
}

function titleFrom(prompt: string) {
  const sentence = prompt.split(/[.\n]/)[0]?.trim() || prompt;
  const words = sentence.split(/\s+/).slice(0, 8).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
