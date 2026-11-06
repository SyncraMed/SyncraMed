import type { DoseLog, Medication, ScheduledDose } from "./types.js";
import { daysBetween, parseYmd } from "./dates.js";

export function isActiveOn(m: Medication, date: string): boolean {
  if (m.archived) return false;
  if (date < m.startDate) return false;
  if (m.endDate && date > m.endDate) return false;
  return true;
}

export function dosesForDay(meds: Medication[], date: string): ScheduledDose[] {
  const out: ScheduledDose[] = [];
  for (const m of meds) {
    if (!isActiveOn(m, date)) continue;
    const s = m.schedule;
    if (s.kind === "prn") continue;
    if (s.kind === "weekdays" && !s.days.includes(parseYmd(date).getDay())) continue;
    if (s.kind === "interval") {
      const n = daysBetween(m.startDate, date);
      if (n < 0 || n % Math.max(1, s.everyDays) !== 0) continue;
    }
    for (const t of [...s.times].sort()) out.push({ medId: m.id, date, time: t, key: `${m.id}|${date}|${t}` });
  }
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

export type DoseState = "taken" | "skipped" | "due" | "upcoming" | "missed";
/** "missed" = scheduled time passed by more than `graceMin` with no action. */
export function doseState(d: ScheduledDose, logs: Map<string, DoseLog>, now: Date, graceMin = 120): DoseState {
  const l = logs.get(d.key);
  if (l) return l.status;
  const [h, m] = d.time.split(":").map(Number);
  const when = parseYmd(d.date); when.setHours(h, m, 0, 0);
  const diff = (now.getTime() - when.getTime()) / 60000;
  if (diff < 0) return "upcoming";
  return diff > graceMin ? "missed" : "due";
}

export function dosesPerDay(m: Medication): number {
  const s = m.schedule;
  if (s.kind === "prn") return 0;
  if (s.kind === "daily") return s.times.length;
  if (s.kind === "weekdays") return (s.times.length * s.days.length) / 7;
  return s.times.length / Math.max(1, s.everyDays);
}

export function describeSchedule(m: Medication): string {
  const s = m.schedule;
  const t = (x: string[]) => x.join(", ");
  if (s.kind === "prn") return "As needed";
  if (s.kind === "daily") return `Daily · ${t(s.times)}`;
  if (s.kind === "weekdays") return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].filter((_, i) => s.days.includes(i)).join(" ")} · ${t(s.times)}`;
  return `Every ${s.everyDays} days · ${t(s.times)}`;
}
