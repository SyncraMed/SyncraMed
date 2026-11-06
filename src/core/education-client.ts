import type { EducationBundle } from "../../shared/education.js";
import { apiUrl } from "./api.js";
import { all, put, type CachedEducation } from "./db.js";
import type { Medication } from "./types.js";

export const eduKey = (m: Pick<Medication, "name" | "kind">) => `${m.kind === "supplement" ? "supplement" : "drug"}:${m.name.trim().toLowerCase()}`;
const DAY = 24 * 3600 * 1000;

export async function cachedEducation(): Promise<Map<string, CachedEducation>> {
  return new Map((await all<CachedEducation>("education")).map((c) => [c.id, c]));
}

/** Only the medication NAME leaves the device. Returns cached data if the network or trusted sources are unavailable. */
export async function loadEducation(m: Pick<Medication, "name" | "kind">, force = false): Promise<{ key: string; bundle: EducationBundle; stale: boolean } | { key: string; error: string }> {
  const key = eduKey(m);
  const cache = (await cachedEducation()).get(key);
  if (cache && !force && Date.now() - cache.at < DAY) return { key, bundle: cache.bundle, stale: false };
  try {
    const kind = m.kind === "supplement" ? "supplement" : "drug";
    const r = await fetch(apiUrl(`/api/education?q=${encodeURIComponent(m.name.trim())}&kind=${kind}`));
    if (!r.ok) throw new Error(String((await r.json().catch(() => ({}))).error ?? r.status));
    const bundle: EducationBundle = await r.json();
    if (bundle.sources.length) await put("education", { id: key, bundle, at: Date.now() } satisfies CachedEducation);
    return { key, bundle, stale: false };
  } catch (e: any) {
    if (cache) return { key, bundle: cache.bundle, stale: true };
    return { key, error: e?.message || "Could not reach the trusted sources." };
  }
}
