import type { Medication } from "./types.js";
import { dosesPerDay } from "./schedule.js";
import { daysBetween } from "./dates.js";

export interface SupplyStatus {
  daysLeft: number | null;       // null when unknown or PRN
  level: "ok" | "soon" | "now" | "unknown";
  expiresInDays: number | null;
  expiry: "ok" | "soon" | "expired" | "none";
}

export function supplyStatus(m: Medication, today: string, refillWarnDays = 7): SupplyStatus {
  const sup = m.supply;
  let daysLeft: number | null = null;
  if (sup?.onHand != null) {
    const perDay = dosesPerDay(m) * (sup.perDose ?? 1);
    daysLeft = perDay > 0 ? Math.floor(sup.onHand / perDay) : null;
  }
  const level = daysLeft == null ? "unknown" : daysLeft <= 2 ? "now" : daysLeft <= refillWarnDays ? "soon" : "ok";
  const expiresInDays = sup?.expires ? daysBetween(today, sup.expires) : null;
  const expiry = expiresInDays == null ? "none" : expiresInDays < 0 ? "expired" : expiresInDays <= 30 ? "soon" : "ok";
  return { daysLeft, level, expiresInDays, expiry };
}
