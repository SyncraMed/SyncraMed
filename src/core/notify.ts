// Reminder delivery.
//  - Web: notifies only while SyncraMed is open or running in the background.
//  - Phone app (Capacitor): the next days of doses are scheduled as local notifications with the operating system,
//    so reminders fire even when the app is closed. Nothing is sent to a server; the schedule never leaves the device.
import type { DoseLog, Medication } from "./types";
import { dosesForDay } from "./schedule";
import { addDays, parseYmd, ymd } from "./dates";
import { isNative } from "./native";

export const notifySupported = () => isNative() || typeof Notification !== "undefined";

export async function requestNotify(): Promise<boolean> {
  if (isNative()) {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const cur = await LocalNotifications.checkPermissions();
    if (cur.display === "granted") return true;
    return (await LocalNotifications.requestPermissions()).display === "granted";
  }
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  return (await Notification.requestPermission()) === "granted";
}

export function showNotification(title: string, body: string, tag: string) {
  if (isNative() || typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try { new Notification(title, { body, tag, icon: "/icon.svg" }); } catch { /* some mobile browsers require a service worker */ }
}

export interface PlannedReminder { id: number; at: Date; title: string; body: string }

const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; return Math.abs(h) % 2147483647 || 1; };

/** The next doses to remind about. iOS allows about 64 pending notifications, so this stops at `limit` (earliest first). */
export function planReminders(meds: Medication[], doseMap: Map<string, DoseLog>, now: Date, days = 7, limit = 60): PlannedReminder[] {
  const out: PlannedReminder[] = [];
  const byId = new Map(meds.filter((m) => !m.archived).map((m) => [m.id, m]));
  for (let i = 0; i <= days; i++) {
    const date = addDays(ymd(now), i);
    for (const d of dosesForDay([...byId.values()], date)) {
      const [h, mi] = d.time.split(":").map(Number);
      const at = parseYmd(date); at.setHours(h, mi, 0, 0);
      if (at <= now || doseMap.has(d.key)) continue;
      const m = byId.get(d.medId)!;
      out.push({ id: hash(d.key), at, title: `Time for ${m.name}`, body: `${m.strength ?? ""} scheduled for ${d.time}`.trim() });
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, limit);
}

/** Replace the phone's scheduled reminders with the current plan. Does nothing on the web. */
export async function syncNativeReminders(meds: Medication[], doseMap: Map<string, DoseLog>, now: Date, enabled: boolean): Promise<void> {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    if (!enabled) return;
    if ((await LocalNotifications.checkPermissions()).display !== "granted") return;
    const plan = planReminders(meds, doseMap, now);
    if (plan.length) await LocalNotifications.schedule({ notifications: plan.map((p) => ({ id: p.id, title: p.title, body: p.body, schedule: { at: p.at, allowWhileIdle: true } })) });
  } catch { /* reminders are best-effort; the in-app list still shows what is due */ }
}
