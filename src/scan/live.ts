// Live scanning reads the camera many times and keeps only what repeats, so one blurry frame can't put a wrong value in the form.
// It looks for five things only: medicine + strength, directions, quantity, refills left and the prescriber.
import { essentials, parseLabel, type ScanResult } from "./parse";

const FIELDS = ["strength", "form", "kind", "schedule", "perDose", "quantity", "refills", "directions", "prescriber"] as const;
type Field = (typeof FIELDS)[number];

export class ScanAccumulator {
  private votes = new Map<Field, Map<string, { n: number; v: unknown }>>();
  private names = new Map<string, { n: number; shown: string; order: number; ok: boolean }>();
  private checked = new Map<string, string | null>();   // printed name -> matched real name (or null if no match)
  /** When the name-matching service can't be reached, fall back to trusting the printed name. */
  offline = false;
  frames = 0;
  lastText = "";

  add(text: string, barcodeName?: string) {
    this.frames++; this.lastText = text || this.lastText;
    const r = parseLabel(text);
    for (const f of FIELDS) {
      const v = r[f];
      if (v === undefined || v === null || v === "") continue;
      if (f === "kind" && r.kind === "rx" && !r.found.includes("name")) continue;
      const m = this.votes.get(f) ?? new Map(); const k = JSON.stringify(v);
      m.set(k, { n: (m.get(k)?.n ?? 0) + 1, v }); this.votes.set(f, m);
    }
    r.nameCandidates.slice(0, 3).forEach((n) => this.voteName(n, 1, false));
    if (barcodeName) this.voteName(barcodeName, 3, true); // an exact FDA barcode hit is already a real medicine
  }
  private voteName(n: string, w: number, ok: boolean) {
    const k = n.toLowerCase(); const cur = this.names.get(k);
    this.names.set(k, { n: (cur?.n ?? 0) + w, shown: cur?.shown ?? n, order: cur?.order ?? this.names.size, ok: ok || !!cur?.ok });
  }

  /** Names seen in two or more readings that haven't been checked against the real medicine list yet. */
  needsChecking(): string[] {
    return [...this.names.values()].filter((x) => x.n >= 2 && !x.ok && !this.checked.has(x.shown.toLowerCase())).map((x) => x.shown);
  }
  /** Record the result of matching a printed name to a real medicine. Partial words ("Lisinop") become the full name. */
  setChecked(printed: string, matched: string | null) {
    const k = printed.toLowerCase(); this.checked.set(k, matched);
    const cur = this.names.get(k); if (!cur) return;
    if (matched === null) return;
    const m = matched.toLowerCase();
    const partial = m.includes(k) && k.length < m.length;
    if (partial) { // fold the partial reading into the full name
      this.names.delete(k);
      const full = this.names.get(m);
      this.names.set(m, { n: (full?.n ?? 0) + cur.n, shown: full?.shown ?? title(matched), order: full?.order ?? cur.order, ok: true });
    } else cur.ok = true;
  }

  topNames(): { name: string; n: number }[] {
    return [...this.names.values()]
      .filter((x) => x.ok || this.offline)
      .sort((a, b) => b.n - a.n || a.order - b.order).map((x) => ({ name: x.shown, n: x.n }));
  }
  private best(f: Field): { v: unknown; n: number } | undefined {
    const m = this.votes.get(f); if (!m) return undefined;
    return [...m.values()].sort((a, b) => b.n - a.n)[0];
  }
  /** A real medicine name plus its strength or directions seen at least twice. */
  ready(): boolean {
    if (!this.topNames()[0]) return false;
    return (["strength", "directions"] as Field[]).some((f) => (this.best(f)?.n ?? 0) >= 2);
  }
  /** All five things found. */
  complete(): boolean {
    return !!this.topNames()[0] && !!this.best("strength") && !!this.best("directions") && !!this.best("quantity") && this.best("refills") !== undefined && !!this.best("prescriber");
  }
  summary(): { label: string; value: string }[] {
    const out: { label: string; value: string }[] = [];
    const n = this.topNames()[0]; const s = this.best("strength");
    if (n) out.push({ label: "Medicine", value: [n.name, s && String(s.v)].filter(Boolean).join(" ") });
    const d = this.best("directions"); if (d) out.push({ label: "Directions", value: String(d.v) });
    const q = this.best("quantity"); if (q) out.push({ label: "Quantity", value: String(q.v) });
    const r = this.best("refills"); if (r) out.push({ label: "Refills", value: String(r.v) });
    const p = this.best("prescriber"); if (p) out.push({ label: "Prescriber", value: String(p.v) });
    return out;
  }
  result(): ScanResult {
    const g = <T,>(f: Field) => this.best(f)?.v as T | undefined;
    const names = this.topNames().map((x) => x.name).slice(0, 4);
    const r: ScanResult = { nameCandidates: names, kind: g<ScanResult["kind"]>("kind") ?? "rx", found: [], warnings: [] };
    r.strength = g("strength"); r.form = g("form"); r.schedule = g("schedule"); r.perDose = g("perDose"); r.quantity = g("quantity"); r.refills = g("refills");
    r.directions = g("directions"); r.prescriber = g("prescriber");
    if (!names.length) r.warnings.push("We couldn't find a medicine name. Try again with the label flat and well lit, or type the name.");
    return essentials(r);
  }
}
const title = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
