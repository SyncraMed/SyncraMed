import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { EducationBundle } from "../shared/education";
import { DEFAULT_SETTINGS, type DoseLog, type Medication, type Pharmacy, type ScheduledDose, type Settings, type SymptomEntry } from "./core/types";
import { all, clearAll, del, put } from "./core/db";
import { cachedEducation, eduKey, loadEducation } from "./core/education-client";
import { dosesForDay, doseState } from "./core/schedule";
import { hm, uid, ymd } from "./core/dates";
import { scanInteractions } from "./core/interactions";
import { showNotification, syncNativeReminders } from "./core/notify";

type Bundles = Map<string, { key: string; bundle: EducationBundle }>;
interface Ctx {
  ready: boolean; now: Date; today: string;
  meds: Medication[]; doses: DoseLog[]; symptoms: SymptomEntry[]; pharmacies: Pharmacy[]; settings: Settings; bundles: Bundles;
  doseMap: Map<string, DoseLog>;
  dueNow: ScheduledDose[];
  interactions: ReturnType<typeof scanInteractions>;
  saveMed(m: Medication): Promise<void>; removeMed(id: string): Promise<void>;
  logDose(d: { medId: string; date: string; time: string }, status: "taken" | "skipped", reason?: string): Promise<void>;
  undoDose(key: string): Promise<void>; logPrn(medId: string): Promise<void>;
  saveSymptom(s: SymptomEntry): Promise<void>; removeSymptom(id: string): Promise<void>;
  savePharmacy(p: Pharmacy): Promise<void>; removePharmacy(id: string): Promise<void>;
  setSettings(p: Partial<Settings>): Promise<void>;
  refreshEducation(m: Medication, force?: boolean): Promise<void>;
  importMeds(ms: Medication[]): Promise<void>;
  restore(data: { meds?: Medication[]; doses?: DoseLog[]; symptoms?: SymptomEntry[]; pharmacies?: Pharmacy[] }): Promise<void>;
  wipe(): Promise<void>;
}
const C = createContext<Ctx>(null as any);
export const useApp = () => useContext(C);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(new Date());
  const [meds, setMeds] = useState<Medication[]>([]);
  const [doses, setDoses] = useState<DoseLog[]>([]);
  const [symptoms, setSymptoms] = useState<SymptomEntry[]>([]);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [bundles, setBundles] = useState<Bundles>(new Map());
  const notified = useRef(new Set<string>());

  const rebuildBundles = useCallback(async (ms: Medication[]) => {
    const cache = await cachedEducation();
    const b: Bundles = new Map();
    for (const m of ms) { const c = cache.get(eduKey(m)); if (c) b.set(m.id, { key: c.id, bundle: c.bundle }); }
    setBundles(b);
  }, []);

  useEffect(() => {
    (async () => {
      const [m, d, s, p, meta] = await Promise.all([all<Medication>("meds"), all<DoseLog>("doses"), all<SymptomEntry>("symptoms"), all<Pharmacy>("pharmacies"), all<any>("meta")]);
      setMeds([...m].sort((a, b) => a.createdAt.localeCompare(b.createdAt))); setDoses(d); setSymptoms(s); setPharmacies(p);
      setSettingsState({ ...DEFAULT_SETTINGS, ...(meta.find((x) => x.id === "settings")?.value ?? {}) });
      await rebuildBundles(m);
      setReady(true);
    })();
  }, [rebuildBundles]);

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);

  useEffect(() => {
    const r = document.documentElement;
    r.style.setProperty("--scale", String(settings.textScale));
    r.dataset.contrast = settings.highContrast ? "high" : "";
    r.dataset.motion = settings.reduceMotion ? "reduce" : "";
  }, [settings]);

  const today = ymd(now);
  const doseMap = useMemo(() => new Map(doses.map((d) => [d.id, d])), [doses]);
  const dueNow = useMemo(() => dosesForDay(meds, today).filter((d) => doseState(d, doseMap, now) === "due"), [meds, today, doseMap, now]);

  // Phone app: keep the operating system's scheduled reminders in step with the medication list and logged doses.
  useEffect(() => { if (ready) void syncNativeReminders(meds, doseMap, new Date(), settings.remindersEnabled); }, [ready, meds, doseMap, settings.remindersEnabled, today]);

  useEffect(() => {
    if (!settings.remindersEnabled) return;
    for (const d of dueNow) {
      if (notified.current.has(d.key)) continue;
      notified.current.add(d.key);
      const m = meds.find((x) => x.id === d.medId);
      if (m) showNotification(`Time for ${m.name}`, `${m.strength ?? ""} scheduled for ${d.time}`.trim(), d.key);
    }
  }, [dueNow, meds, settings.remindersEnabled]);

  const interactions = useMemo(() => scanInteractions(meds, bundles), [meds, bundles]);

  const inflight = useRef(new Map<string, Promise<void>>());
  const refreshEducation = useCallback((m: Medication, force = false): Promise<void> => {
    const hit = inflight.current.get(m.id);
    if (hit && !force) return hit;
    const p = doRefresh(m, force).finally(() => inflight.current.delete(m.id));
    inflight.current.set(m.id, p);
    return p;
  }, []);
  const doRefresh = useCallback(async (m: Medication, force: boolean) => {
    const r = await loadEducation(m, force);
    if ("bundle" in r) {
      if (r.bundle.rxcui && r.bundle.rxcui !== m.rxcui) { const u = { ...m, rxcui: r.bundle.rxcui }; await put("meds", u); setMeds((p) => p.map((x) => (x.id === m.id ? u : x))); }
      setBundles((p) => new Map(p).set(m.id, { key: r.key, bundle: r.bundle }));
    }
  }, []);

  // Fill in education for any medication that has none cached (runs after load and after adds).
  const fetching = useRef(new Set<string>());
  useEffect(() => {
    if (!ready) return;
    for (const m of meds) {
      if (m.archived || bundles.has(m.id) || fetching.current.has(m.id)) continue;
      fetching.current.add(m.id);
      refreshEducation(m).finally(() => fetching.current.delete(m.id));
    }
  }, [ready, meds, bundles, refreshEducation]);

  const value: Ctx = {
    ready, now, today, meds, doses, symptoms, pharmacies, settings, bundles, doseMap, dueNow, interactions,
    async saveMed(m) { await put("meds", m); setMeds((p) => (p.some((x) => x.id === m.id) ? p.map((x) => (x.id === m.id ? m : x)) : [...p, m])); },
    async removeMed(id) {
      await del("meds", id); setMeds((p) => p.filter((x) => x.id !== id));
      for (const d of doses.filter((x) => x.medId === id)) await del("doses", d.id);
      setDoses((p) => p.filter((x) => x.medId !== id));
    },
    async logDose(d, status, reason) {
      const log: DoseLog = { id: `${d.medId}|${d.date}|${d.time}`, medId: d.medId, date: d.date, time: d.time, status, at: new Date().toISOString(), reason };
      await put("doses", log); setDoses((p) => [...p.filter((x) => x.id !== log.id), log]);
      const m = meds.find((x) => x.id === d.medId);
      if (status === "taken" && m?.supply?.onHand != null) {
        const u = { ...m, supply: { ...m.supply, onHand: Math.max(0, m.supply.onHand - (m.supply.perDose ?? 1)) } };
        await put("meds", u); setMeds((p) => p.map((x) => (x.id === u.id ? u : x)));
      }
    },
    async undoDose(key) {
      const l = doseMap.get(key); if (!l) return;
      await del("doses", key); setDoses((p) => p.filter((x) => x.id !== key));
      const m = meds.find((x) => x.id === l.medId);
      if (l.status === "taken" && m?.supply?.onHand != null) {
        const u = { ...m, supply: { ...m.supply, onHand: m.supply.onHand + (m.supply.perDose ?? 1) } };
        await put("meds", u); setMeds((p) => p.map((x) => (x.id === u.id ? u : x)));
      }
    },
    async logPrn(medId) {
      const n = doses.filter((x) => x.medId === medId && x.date === today && x.time.startsWith("prn")).length;
      const log: DoseLog = { id: `${medId}|${today}|prn-${n + 1}`, medId, date: today, time: `prn-${n + 1}`, status: "taken", at: new Date().toISOString() };
      await put("doses", log); setDoses((p) => [...p, log]);
      const m = meds.find((x) => x.id === medId);
      if (m?.supply?.onHand != null) { const u = { ...m, supply: { ...m.supply, onHand: Math.max(0, m.supply.onHand - (m.supply.perDose ?? 1)) } }; await put("meds", u); setMeds((p) => p.map((x) => (x.id === u.id ? u : x))); }
    },
    async saveSymptom(s) { await put("symptoms", s); setSymptoms((p) => (p.some((x) => x.id === s.id) ? p.map((x) => (x.id === s.id ? s : x)) : [...p, s])); },
    async removeSymptom(id) { await del("symptoms", id); setSymptoms((p) => p.filter((x) => x.id !== id)); },
    async savePharmacy(ph) {
      let list = pharmacies.some((x) => x.id === ph.id) ? pharmacies.map((x) => (x.id === ph.id ? ph : x)) : [...pharmacies, ph];
      if (ph.primary) list = list.map((x) => (x.id === ph.id ? x : { ...x, primary: false }));
      for (const x of list) await put("pharmacies", x);
      setPharmacies(list);
    },
    async removePharmacy(id) { await del("pharmacies", id); setPharmacies((p) => p.filter((x) => x.id !== id)); },
    async setSettings(p) { const s = { ...settings, ...p }; setSettingsState(s); await put("meta", { id: "settings", value: s }); },
    refreshEducation,
    async importMeds(ms) { for (const m of ms) await put("meds", m); setMeds((p) => [...p, ...ms]); },
    async restore(d) {
      for (const m of d.meds ?? []) await put("meds", m);
      for (const x of d.doses ?? []) await put("doses", x);
      for (const x of d.symptoms ?? []) await put("symptoms", x);
      for (const x of d.pharmacies ?? []) await put("pharmacies", x);
      setMeds((await all<Medication>("meds")).sort((a, b) => a.createdAt.localeCompare(b.createdAt))); setDoses(await all<DoseLog>("doses")); setSymptoms(await all<SymptomEntry>("symptoms")); setPharmacies(await all<Pharmacy>("pharmacies"));
    },
    async wipe() { await clearAll(); setMeds([]); setDoses([]); setSymptoms([]); setPharmacies([]); setBundles(new Map()); setSettingsState(DEFAULT_SETTINGS); },
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}
export { uid, hm };
