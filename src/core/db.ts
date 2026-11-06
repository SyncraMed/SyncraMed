import { openDB, type IDBPDatabase } from "idb";
import type { EducationBundle } from "../../shared/education.js";

// Everything the user enters lives in this browser (IndexedDB). Nothing here is sent to a server.
export type StoreName = "meds" | "doses" | "symptoms" | "pharmacies" | "education" | "meta";
const NAMES: StoreName[] = ["meds", "doses", "symptoms", "pharmacies", "education", "meta"];
let dbp: Promise<IDBPDatabase> | null = null;
const mem: Record<string, Map<string, any>> = Object.fromEntries(NAMES.map((n) => [n, new Map()]));
let useMem = false;

function db() {
  dbp ??= openDB("syncramed", 1, { upgrade(d) { for (const n of NAMES) d.createObjectStore(n, { keyPath: "id" }); } }).catch((e) => { useMem = true; throw e; });
  return dbp;
}
export async function all<T>(s: StoreName): Promise<T[]> {
  try { if (!useMem) return (await (await db()).getAll(s)) as T[]; } catch { useMem = true; }
  return [...mem[s].values()] as T[];
}
export async function put<T extends { id: string }>(s: StoreName, v: T) {
  try { if (!useMem) { await (await db()).put(s, v); return; } } catch { useMem = true; }
  mem[s].set(v.id, v);
}
export async function del(s: StoreName, id: string) {
  try { if (!useMem) { await (await db()).delete(s, id); return; } } catch { useMem = true; }
  mem[s].delete(id);
}
export async function clearAll() {
  try { if (!useMem) { const d = await db(); for (const n of NAMES) await d.clear(n); } } catch { /* ignore */ }
  for (const n of NAMES) mem[n].clear();
  try { localStorage.clear(); sessionStorage.clear(); } catch { /* ignore */ }
}

export interface CachedEducation { id: string; bundle: EducationBundle; at: number }
