import type { DoseLog, Medication, SymptomEntry } from "./types.js";
import { dosesForDay, doseState } from "./schedule.js";
import { addDays } from "./dates.js";

export interface DayStat { date: string; scheduled: number; taken: number; skipped: number; missed: number }

export function dayStats(meds: Medication[], logs: DoseLog[], date: string, now: Date): DayStat {
  const map = new Map(logs.map((l) => [l.id, l]));
  const doses = dosesForDay(meds, date);
  let taken = 0, skipped = 0, missed = 0;
  for (const d of doses) {
    const s = doseState(d, map, now);
    if (s === "taken") taken++; else if (s === "skipped") skipped++; else if (s === "missed") missed++;
  }
  // As-needed doses are tracked separately; they never offset a missed scheduled dose.
  return { date, scheduled: doses.length, taken, skipped, missed };
}

export function rangeStats(meds: Medication[], logs: DoseLog[], endDate: string, days: number, now: Date) {
  const stats: DayStat[] = [];
  for (let i = days - 1; i >= 0; i--) stats.push(dayStats(meds, logs, addDays(endDate, -i), now));
  const sched = stats.reduce((a, s) => a + s.scheduled, 0);
  const taken = stats.reduce((a, s) => a + Math.min(s.taken, s.scheduled), 0);
  return { stats, scheduled: sched, taken, pct: sched ? Math.round((taken / sched) * 100) : null };
}

/** Counts only. With a handful of days this is a conversation starter, never a conclusion. */
export function missedVsSymptoms(stats: DayStat[], symptoms: SymptomEntry[]) {
  const symDates = new Set(symptoms.map((s) => s.date));
  let missedDays = 0, missedWithSym = 0, okDays = 0, okWithSym = 0;
  for (const s of stats) {
    if (!s.scheduled) continue;
    const hadSym = symDates.has(s.date) || symDates.has(addDays(s.date, 1));
    if (s.missed + s.skipped > 0) { missedDays++; if (hadSym) missedWithSym++; }
    else { okDays++; if (hadSym) okWithSym++; }
  }
  return { missedDays, missedWithSym, okDays, okWithSym };
}
