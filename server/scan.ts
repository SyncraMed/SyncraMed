// Helpers for the "scan a bottle" feature. The photo itself is read on the device; only a few
// candidate medicine names (or barcode digits) ever reach this server, and only trusted hosts are called.
import { getJson } from "./trusted.js";
import { normalizeLabel } from "./sources/openfda.js";

export interface Resolution { input: string; name: string; ingredient?: string; rxcui: string }
export interface CodeMatch { name: string; generic?: string; brand?: string; setId?: string }

const words = (s: string) => (s.toLowerCase().match(/[a-z]{4,}/g) ?? []);

/** Match OCR'd names to real drugs via RxNorm. OCR junk usually yields a low score and no shared word, so it is dropped. */
export async function resolveCandidates(names: string[]): Promise<Resolution[]> {
  const out: Resolution[] = [];
  for (const raw of names.slice(0, 4)) {
    const term = raw.replace(/[^A-Za-z0-9 '\-\/.]/g, " ").trim().slice(0, 60);
    if (term.length < 3) continue;
    const a = await getJson(`https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(term)}&maxEntries=1`);
    const c = a?.approximateGroup?.candidate?.[0];
    if (!c?.rxcui) continue;
    const p = await getJson(`https://rxnav.nlm.nih.gov/REST/rxcui/${c.rxcui}/properties.json`);
    const rel = await getJson(`https://rxnav.nlm.nih.gov/REST/rxcui/${c.rxcui}/related.json?tty=IN`);
    const ing: string | undefined = rel?.relatedGroup?.conceptGroup?.flatMap((g: any) => g.conceptProperties ?? [])?.[0]?.name;
    const full: string = p?.properties?.name ?? "";
    const hay = `${full} ${ing ?? ""}`.toLowerCase();
    const shared = words(term).some((w) => hay.includes(w));
    if (!shared && Number(c.score ?? 0) < 75) continue;
    out.push({ input: raw, name: ing ?? full.replace(/\s+\d.*$/, ""), ingredient: ing, rxcui: String(c.rxcui) });
  }
  return out;
}

/** UPC/EAN/NDC digits -> every NDC spelling openFDA might store (4-4-2, 5-3-2, 5-4-1 with hyphens). */
export function ndcVariants(code: string): string[] {
  const d = code.replace(/\D/g, "");
  const inner = new Set<string>();
  if (d.length === 11) inner.add(d);
  if (d.length === 10) inner.add(d);
  if (d.length === 12) { inner.add(d.slice(1, 11)); inner.add(d.slice(1, 12)); inner.add(d.slice(0, 11)); }
  if (d.length === 13 || d.length === 14) { inner.add(d.slice(-11)); inner.add(d.slice(-12, -2)); inner.add(d.slice(-11, -1)); }
  const v = new Set<string>();
  for (const n of inner) {
    if (n.length === 11) {
      const [a, b, c] = [n.slice(0, 5), n.slice(5, 9), n.slice(9)];
      v.add(`${a}-${b}-${c}`);
      if (a[0] === "0") v.add(`${a.slice(1)}-${b}-${c}`);
      if (b[0] === "0") v.add(`${a}-${b.slice(1)}-${c}`);
      if (c[0] === "0") v.add(`${a}-${b}-${c.slice(1)}`);
    } else if (n.length === 10) {
      v.add(`${n.slice(0, 4)}-${n.slice(4, 8)}-${n.slice(8)}`);
      v.add(`${n.slice(0, 5)}-${n.slice(5, 8)}-${n.slice(8)}`);
      v.add(`${n.slice(0, 5)}-${n.slice(5, 9)}-${n.slice(9)}`);
    }
  }
  return [...v];
}

export async function lookupCode(code: string, apiKey?: string): Promise<CodeMatch | null> {
  const digits = code.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 14) return null;
  const terms = [`openfda.upc:"${digits}"`, ...ndcVariants(digits).map((n) => `openfda.package_ndc:"${n}"`)];
  const key = apiKey ? `&api_key=${apiKey}` : "";
  const data = await getJson(`https://api.fda.gov/drug/label.json?search=${encodeURIComponent(terms.join(" OR "))}&limit=3${key}`);
  const first = data?.results?.[0];
  if (!first) return null;
  const l = normalizeLabel(first);
  const generic = l.generic[0]; const brand = l.brand[0];
  const name = generic ?? brand;
  if (!name) return null;
  const tc = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
  return { name: tc(name), generic: generic && tc(generic), brand: brand && tc(brand), setId: l.setId };
}
