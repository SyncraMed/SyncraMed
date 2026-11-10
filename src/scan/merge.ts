// Each read of the label can miss a different word. Reading it more than one way and combining the answers fills the gaps:
// for each field the value most readings agree on wins; a field one reading missed is taken from another.
import { essentials, parseLabel, type ScanResult } from "./parse";

const FIELDS = ["strength", "form", "directions", "quantity", "refills", "prescriber", "schedule", "perDose"] as const;

export function mergeReads(texts: string[]): ScanResult {
  const all = texts.map((t) => essentials(parseLabel(t)));
  const joined = essentials(parseLabel(texts.join("\n"))); // lines one pass cut in half may be whole in the combined text
  const reads = [...all, joined];
  const out: ScanResult = { ...reads[0], nameCandidates: [], found: [], warnings: [] };
  const VERB = /^(take|use|apply|inject|inhale|insert|chew|dissolve|place|instill|spray)\b/i;
  for (const f of FIELDS) {
    if (f === "directions") { // the most complete directions: one that starts with a verb, can be turned into a schedule, and several readings agree on
      const cand = reads.filter((r) => r.directions).map((r) => ({ d: r.directions!, sc: (VERB.test(r.directions!) ? 100 : 0) + (r.schedule ? 50 : 0) + reads.filter((x) => x.directions === r.directions).length * 10 + Math.min(9, r.directions!.length / 10) }));
      out.directions = cand.sort((a, b) => b.sc - a.sc)[0]?.d; continue;
    }
    const votes = new Map<string, { n: number; v: unknown; first: number }>();
    reads.forEach((r, i) => { const v = r[f]; if (v === undefined || v === null || v === "") return; const k = JSON.stringify(v); const c = votes.get(k); if (c) c.n++; else votes.set(k, { n: 1, v, first: i }); });
    const best = [...votes.values()].sort((a, b) => b.n - a.n || a.first - b.first)[0];
    let v = best?.v;
    if (f === "prescriber" && typeof v === "string") { // a name cut short in one reading is completed by another that has the rest
      for (const o of votes.values()) if (typeof o.v === "string" && o.v.length > (v as string).length && o.v.toLowerCase().startsWith((v as string).toLowerCase())) v = o.v;
    }
    (out as any)[f] = v;
  }
  const names = new Map<string, { n: number; shown: string }>();
  for (const r of reads) r.nameCandidates.forEach((n, i) => { const k = n.toLowerCase(); const c = names.get(k); if (c) c.n += 1 + (i === 0 ? 0.5 : 0); else names.set(k, { n: 1 + (i === 0 ? 0.5 : 0), shown: n }); });
  out.nameCandidates = [...names.values()].sort((a, b) => b.n - a.n).map((x) => x.shown).slice(0, 4);
  out.kind = reads.find((r) => r.kind !== "rx")?.kind ?? "rx";
  const fresh = essentials({ ...out, found: [], warnings: [] } as ScanResult);
  fresh.warnings = [];
  if (!fresh.nameCandidates.length) fresh.warnings.push("We couldn't find a medicine name. Try a clearer photo of the label, or type the name.");
  if (!fresh.strength) fresh.warnings.push("We couldn't read the strength. Check it against your bottle.");
  if (fresh.directions && !fresh.schedule) fresh.warnings.push("We read the directions but couldn't turn them into a schedule. Please set the times yourself.");
  return fresh;
}
