import { getJson } from "../trusted.js";
import { cleanLabelText } from "../text.js";

export interface FdaLabel {
  setId?: string;
  effective?: string;
  productType: string;
  generic: string[];
  brand: string[];
  drugClass?: string;
  rxcuis: string[];
  ndcs: string[];
  fields: Partial<Record<"indications" | "dosage" | "adverse" | "warnings" | "boxed" | "interactions" | "contraindications", string>>;
}

const join = (v: unknown): string | undefined =>
  Array.isArray(v) && v.length ? cleanLabelText(v.join(" ")) : undefined;

export function normalizeLabel(r: any): FdaLabel {
  const o = r.openfda ?? {};
  return {
    setId: r.set_id,
    effective: r.effective_time,
    productType: (o.product_type?.[0] ?? "").toString(),
    generic: o.generic_name ?? [],
    brand: o.brand_name ?? [],
    drugClass: o.pharm_class_epc?.[0],
    rxcuis: o.rxcui ?? [],
    ndcs: o.package_ndc ?? [],
    fields: {
      indications: join(r.indications_and_usage),
      dosage: join(r.dosage_and_administration),
      adverse: join(r.adverse_reactions),
      warnings: join(r.warnings_and_cautions) ?? join(r.warnings),
      boxed: join(r.boxed_warning),
      interactions: join(r.drug_interactions),
      contraindications: join(r.contraindications),
    },
  };
}

/** A bare `limit=1` search can return an unrelated OTC or homeopathic label, so fetch several and rank. */
export function pickBestLabel(results: any[], query: string): FdaLabel | null {
  const q = query.trim().toLowerCase();
  let best: { l: FdaLabel; score: number } | null = null;
  for (const r of results) {
    const l = normalizeLabel(r);
    if (!l.fields.indications) continue;
    let score = Math.min(l.fields.indications.length, 600) / 60;
    if (/prescription/i.test(l.productType)) score += 100;
    if (l.generic.some((g) => g.toLowerCase() === q)) score += 50;
    else if (l.brand.some((b) => b.toLowerCase() === q)) score += 40;
    if (l.generic.length === 1) score += 10; // single-ingredient preferred over kits/combos
    if (l.fields.adverse) score += 10;
    if (l.fields.interactions) score += 10;
    if (!best || score > best.score) best = { l, score };
  }
  return best?.l ?? null;
}

export async function fetchFdaLabel(name: string, apiKey?: string): Promise<FdaLabel | null> {
  const n = name.replace(/["\\]/g, "").trim();
  if (!n) return null;
  const search = encodeURIComponent(`openfda.generic_name:"${n}" OR openfda.brand_name:"${n}" OR openfda.substance_name:"${n}"`);
  const key = apiKey ? `&api_key=${apiKey}` : "";
  const data = await getJson(`https://api.fda.gov/drug/label.json?search=${search}&limit=12${key}`);
  if (!data?.results?.length) return null;
  return pickBestLabel(data.results, n);
}
