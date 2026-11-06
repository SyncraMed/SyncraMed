import type { MedKind, Schedule } from "../core/types";

// Turns OCR text from a medicine bottle into suggested fields. Everything here is a SUGGESTION:
// the user always reviews and confirms before anything is saved. The patient's own name and address are never extracted.

export interface ScanResult {
  nameCandidates: string[];          // best guess first; the server later matches these to real drug names
  strength?: string;
  form?: string;
  kind: MedKind;
  schedule?: Schedule;
  perDose?: number;
  quantity?: number;                  // pills dispensed, offered as "pills on hand"
  refills?: number;
  expires?: string;                   // YYYY-MM-DD
  filled?: string;                    // YYYY-MM-DD
  directions?: string;                // exactly as printed
  prescriber?: string;
  pharmacy?: { name?: string; phone?: string };
  indication?: string;
  found: string[];                    // human-readable list of what was read
  warnings: string[];
}

const DEFAULT_TIMES: Record<number, string[]> = { 1: ["08:00"], 2: ["08:00", "20:00"], 3: ["08:00", "14:00", "20:00"], 4: ["08:00", "12:00", "16:00", "20:00"] };
const FORMS = "tablets?|tabs?|capsules?|caps?|softgels?|caplets?|chewables?|lozenges?|solution|suspension|syrup|elixir|cream|ointment|gel|lotion|patch(?:es)?|injection|injectable|pen|inhaler|spray|drops|powder|suppositor(?:y|ies)|film";
const UNIT = "mg|mcg|µg|ug|g|ml|iu|units?|meq|%";
const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, half: 0.5, "1/2": 0.5, "½": 0.5 };

const title = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\bDr\b\.?/g, "Dr.");
const clean = (s: string) => s.replace(/[|_~`“”]/g, " ").replace(/\s+/g, " ").trim();

function parseDate(s: string): string | undefined {
  const m = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/) ?? undefined;
  if (m) {
    let [_, a, b, y] = m; let yr = Number(y); if (yr < 100) yr += 2000;
    const mo = Number(a), d = Number(b);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${yr}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  const my = s.match(/\b(\d{1,2})[\/\-](20\d{2})\b/);
  if (my && Number(my[1]) >= 1 && Number(my[1]) <= 12) {
    const last = new Date(Number(my[2]), Number(my[1]), 0).getDate(); // "EXP 06/2027" means end of that month
    return `${my[2]}-${my[1].padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  }
  const mon = s.match(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\.?\s+(?:\d{1,2},?\s+)?(20\d{2})\b/i);
  if (mon) {
    const mi = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"].indexOf(mon[1].toUpperCase().slice(0, 3)) + 1;
    return `${mon[2]}-${String(mi).padStart(2, "0")}-${String(new Date(Number(mon[2]), mi, 0).getDate()).padStart(2, "0")}`;
  }
  return undefined;
}

export function parseDirections(text: string): { schedule?: Schedule; perDose?: number } {
  const t = text.toLowerCase();
  const per = t.match(/\b(?:take|use|chew|swallow|inject|insert|place|dissolve)\s+(\d+(?:\.\d+)?|one|two|three|four|half|1\/2|½)\s+(?:and\s+(?:a\s+)?half\s+)?(?:\w+\s+)?(?:tablets?|tabs?|capsules?|caps?|softgels?|caplets?|pills?|puffs?|drops?|patch(?:es)?|units?)/);
  const perDose = per ? (WORD_NUM[per[1]] ?? Number(per[1])) : undefined;
  if (/\bas needed\b|\bprn\b|\bwhen needed\b|\bif needed\b/.test(t) && !/\b(every|times|daily|twice)\b/.test(t.replace(/every \d+(-\d+)? hours? as needed/, ""))) return { schedule: { kind: "prn" }, perDose };
  let n: number | undefined;
  const hrs = t.match(/every\s+(\d{1,2})(?:\s*(?:-|to)\s*\d{1,2})?\s*hours?/);
  if (hrs && Number(hrs[1]) > 0) n = Math.max(1, Math.min(4, Math.floor(24 / Number(hrs[1]))));
  else if (/\b(four|4)\s+times\s+(a|per)?\s*(day|daily)|\bqid\b/.test(t)) n = 4;
  else if (/\b(three|3)\s+times\s+(a|per)?\s*(day|daily)|\btid\b/.test(t)) n = 3;
  else if (/\btwice\b|\b(two|2)\s+times\s+(a|per)?\s*(day|daily)|\bbid\b/.test(t)) n = 2;
  else if (/\bonce\s+(a|per)?\s*day\b|\bonce daily\b|\bdaily\b|\bevery day\b|\bevery morning\b|\bevery evening\b|\bat bedtime\b|\bnightly\b|\bonce a night\b|\bqd\b|\bin the (morning|evening)\b/.test(t)) n = 1;
  if (/\bevery other day\b|\bevery 2 days\b/.test(t)) return { schedule: { kind: "interval", everyDays: 2, times: ["08:00"] }, perDose };
  if (/\bevery (7|seven) days\b|\bonce (a|per) week\b|\bweekly\b|\bevery week\b/.test(t)) return { schedule: { kind: "interval", everyDays: 7, times: ["08:00"] }, perDose };
  if (/\bevery (14|fourteen) days\b|\bevery other week\b|\bevery 2 weeks\b|\bevery two weeks\b/.test(t)) return { schedule: { kind: "interval", everyDays: 14, times: ["08:00"] }, perDose };
  if (!n) return { perDose };
  const times = /bedtime|nightly|at night|every evening/.test(t) && n === 1 ? ["21:00"] : DEFAULT_TIMES[n];
  return { schedule: { kind: "daily", times }, perDose };
}

const NOISE = /\b(pharmacy|rx|refill|qty|quantity|filled|discard|exp|expires|take|use|apply|inject|dr\b|doctor|physician|phone|ph\b|store|address|www|http|warning|caution|keep|out of reach|children|generic for|manufacturer|mfg|lot|ndc|date|dispensed|patient|prescriber|label|directions)\b/i;
const PHARMACY_WORDS = /\b(pharmacy|drug\s*store|drugs|walgreens|cvs|publix|walmart|wal-mart|rite aid|kroger|costco|sam'?s club|target|winn[- ]dixie|albertsons|safeway|h-?e-?b|meijer|express scripts|optum|amazon pharmacy|medicine shoppe)\b/i;

/**
 * A pharmacy label reads top to bottom: logo, address, patient name, Rx number, THEN the medicine name and strength, THEN the directions.
 * Everything above the medicine line is not about the medicine, so it is dropped before the name, strength and directions are read.
 * (Prescriber, pharmacy and dates are still read from the whole label, as optional extras.)
 */
export function focusLines(all: string[]): string[] {
  const flat = all.join(" ");
  if (!/\b(rx|refills?|qty|dispensed|pharmacy)\b/i.test(flat)) return all; // OTC and supplement panels keep their own layout
  const strengthRe = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${UNIT})(?![a-z])`, "i");
  const formRe = new RegExp(`\\b(${FORMS})\\b`, "i");
  const i = all.findIndex((l) => strengthRe.test(l) && !/^(take|use|apply|inject)\b/i.test(l) && !/\b(qty|refills?|discard|exp\w*|rx|phone|ph|filled|date)\b/i.test(l) && (formRe.test(l) || /[a-z]{4,}/i.test(l.replace(strengthRe, ""))));
  if (i < 0) return all;
  let start = i;
  // "LISINOPRIL" on one line and "10 MG TABLET" on the next: take the single word above, but never a two-word patient name.
  const leftover = all[i].replace(strengthRe, "").replace(formRe, "").replace(/[^A-Za-z]/g, "");
  const prev = all[i - 1];
  if (leftover.length < 4 && prev && /^[A-Za-z][A-Za-z'\-]{4,}$/.test(prev) && !NOISE.test(prev) && !PHARMACY_WORDS.test(prev)) start = i - 1;
  return all.slice(start);
}

/** OCR often reads 0 as O and 1 as l or I next to units and counts ("1O MG", "QTY 6O"). Repair only where a number must be. */
export function fixDigits(raw: string): string {
  const num = (t: string) => t.replace(/[Oo]/g, "0").replace(/[Il|]/g, "1");
  return raw
    .replace(/\b([0-9OoIl|]{1,5})(\.[0-9OoIl]{1,2})?\s?(mg|mcg|ml|g|iu|units?)\b/gi, (m, a: string, b: string | undefined, u: string) => (/\d/.test(a) ? `${num(a)}${b ? num(b) : ""} ${u}` : m))
    .replace(/\b(qty|quantity|refills?)(\s*[:#.]?\s*)([0-9OoIl|]{1,4})\b/gi, (m, k: string, sep: string, t: string) => (/\d/.test(t) || (/^refill/i.test(k) && /^[Oo]$/.test(t)) ? `${k}${sep}${num(t)}` : m));
}

/**
 * The only things a bottle scan is meant to find: the medicine and its strength, the directions, the quantity,
 * the refills left and the prescriber. Pharmacy, dates, Rx number and patient are not carried forward.
 */
export function essentials(r: ScanResult): ScanResult {
  const e: ScanResult = { nameCandidates: r.nameCandidates, kind: r.kind, strength: r.strength, form: r.form, directions: r.directions, schedule: r.schedule, perDose: r.perDose, quantity: r.quantity, refills: r.refills, prescriber: r.prescriber, found: [], warnings: r.warnings };
  if (e.nameCandidates.length) e.found.push("name");
  for (const [k, l] of [["strength", "strength"], ["form", "form"], ["directions", "directions"], ["quantity", "quantity"], ["refills", "refills"], ["prescriber", "prescriber"]] as const) if (e[k] !== undefined) e.found.push(l);
  return e;
}

export function parseLabel(raw0: string): ScanResult {
  const raw = fixDigits(raw0);
  const allLines = raw.split(/\r?\n/).map(clean).filter((l) => l.length > 1);
  const lines = focusLines(allLines);
  const text = lines.join("\n");
  const flat = allLines.join(" ");
  const r: ScanResult = { nameCandidates: [], kind: "rx", found: [], warnings: [] };

  // kind
  if (/supplement facts|dietary supplement/i.test(flat)) r.kind = "supplement";
  else if (/drug facts|active ingredient|\bpurpose\b|\bpain reliever\b|\bfever reducer\b/i.test(flat) && !/\brefills?\b|\brx\b/i.test(flat)) r.kind = "otc";
  else r.kind = "rx";

  // strength + form: prefer the line that has both a strength and a dosage form
  const strengthRe = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${UNIT})(?:\\s*\\/\\s*(\\d+(?:\\.\\d+)?)?\\s*(ml|mg|g))?(?![a-z])`, "i");
  const formRe = new RegExp(`\\b(${FORMS})\\b`, "i");
  let drugLine = lines.find((l) => strengthRe.test(l) && formRe.test(l) && !/^(take|use|apply|inject)/i.test(l) && !/\b(qty|refill|discard|exp)/i.test(l))
    ?? lines.find((l) => strengthRe.test(l) && !NOISE.test(l) && /[a-z]{4,}/i.test(l));
  if (drugLine) {
    const m = drugLine.match(strengthRe)!;
    r.strength = `${m[1]} ${m[2].toLowerCase().replace("µg", "mcg")}${m[4] ? ` / ${m[3] ?? ""}${m[3] ? " " : ""}${m[4].toLowerCase()}` : ""}`.replace(/\s+/g, " ").trim();
    const f = drugLine.match(formRe);
    if (f) r.form = f[1].toLowerCase().replace(/s$/, "").replace(/^tab$/, "tablet").replace(/^cap$/, "capsule");
    const before = clean(drugLine.slice(0, m.index).replace(/^\s*(rx\s*#?\s*[\d-]+|\d{5,})\s*/i, ""));
    if (/^[A-Za-z][A-Za-z\s'\-\/().]{2,50}$/.test(before)) r.nameCandidates.push(before);
  }
  // OTC "Active ingredient" panel: "Active ingredient (in each tablet) Ibuprofen 200 mg"
  const ai = flat.match(/active ingredients?[^A-Za-z]{0,3}(?:\([^)]*\))?\s*([A-Za-z][A-Za-z\- ]{2,40}?)\s+\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu)/i);
  if (ai) r.nameCandidates.push(clean(ai[1]));
  // Supplement panel: "Vitamin D3 (as cholecalciferol) 25 mcg"
  if (r.kind === "supplement") {
    const sup = flat.match(/\b(vitamin\s+[A-Z]\d{0,2}|magnesium|calcium|zinc|iron|biotin|folate|folic acid|omega-3|fish oil|melatonin|multivitamin)\b/i);
    if (sup) r.nameCandidates.push(clean(sup[1]));
  }
  // Fallback: top non-noise, mostly-letter lines (brand names are usually printed first)
  // On prescription labels the other top lines are the patient/pharmacy, so only look when nothing else was found.
  for (const l of lines.slice(0, 8)) {
    // Pharmacy labels print the patient's name near the top, so never guess a name from loose lines there.
    if (r.nameCandidates.length >= 4 || (r.kind === "rx" && r.nameCandidates.length) || /\b(rx|refills?|qty|dispensed|pharmacy)\b/i.test(flat)) break;
    if (NOISE.test(l) || PHARMACY_WORDS.test(l) || /\d{3}/.test(l) || l.length < 3 || l.length > 40) continue;
    if (/^[A-Za-z][A-Za-z\s'\-]+$/.test(l)) r.nameCandidates.push(l);
  }
  r.nameCandidates = [...new Set(r.nameCandidates.map((n) => n.replace(/\s+(tablet|capsule|tab|cap)s?$/i, "").trim()).filter((n) => n.length > 2))].slice(0, 4).map((n) => (n === n.toUpperCase() ? title(n) : n));

  // directions
  const dirIdx = lines.findIndex((l) => /^(take|use|apply|inject|inhale|insert|chew|dissolve|place|instill|spray)\b/i.test(l));
  if (dirIdx >= 0) {
    let d = lines[dirIdx];
    let end = dirIdx;
    const STOP = /^(qty|quantity|refill|discard|exp|filled|date|rx\b|dr\b|ndc|warning|caution|pharmacy|phone|for:)/i;
    while (end + 1 < lines.length && d.length < 220 && !/[.]$/.test(d) && !STOP.test(lines[end + 1])) d += " " + lines[++end];
    const shown = d === d.toUpperCase() ? d.toLowerCase() : d;
    r.directions = shown.charAt(0).toUpperCase() + shown.slice(1);
    const p = parseDirections(d);
    r.schedule = p.schedule; r.perDose = p.perDose;
  }

  // quantity / refills / dates
  const q = flat.match(/\b(?:qty|quantity|dispensed)\s*[:#.]?\s*(\d{1,4})\b/i); if (q) r.quantity = Number(q[1]);
  const rf = flat.match(/\brefills?(?:\s*(?:remaining|left))?\s*[:#.]?\s*(\d{1,2})\b/i); if (rf) r.refills = Number(rf[1]);
  else if (/\bno refills\b|\brefills?\s*[:]?\s*none\b/i.test(flat)) r.refills = 0;
  const ex = flat.match(/\b(?:discard after|discard by|use by|exp(?:ires?|iration)?(?: date)?|expiry)\s*[:.]?\s*([A-Za-z0-9\/\-., ]{4,20})/i);
  if (ex) r.expires = parseDate(ex[1]);
  const fl = flat.match(/\b(?:date filled|filled|fill date|dispensed)\s*[:.]?\s*([0-9\/\-.]{6,10})/i); if (fl) r.filled = parseDate(fl[1]);

  // prescriber (Dr. Maria Lopez). The patient name is deliberately not read.
  for (const l of allLines) {
    const m = l.match(/\b(?:dr\.?|doctor|prescriber|prescribed by|physician)\s*[:.]?\s*([A-Za-z][A-Za-z'.\-]+(?:,?\s+[A-Za-z][A-Za-z'.\-]+){0,2})/i);
    if (!m) continue;
    const name = m[1].replace(/\b(Qty|Refills?|Filled|Rx|Date|Discard|Take|Phone|Ph)\b.*$/i, "").replace(/[,.]$/, "").trim();
    if (name.length > 2) { r.prescriber = /^(dr|doctor)/i.test(m[0]) ? `Dr. ${title(name)}` : title(name); break; }
  }

  // pharmacy
  const phone = flat.match(/\(?\b(\d{3})\)?[\s.\-]?(\d{3})[\s.\-](\d{4})\b/);
  const phLine = allLines.find((l) => PHARMACY_WORDS.test(l));
  if (phLine || phone) {
    const nm = phLine ? clean(phLine.replace(/#\s*\d+.*$/, "").replace(/\d{2,}.*$/, "")) : undefined;
    r.pharmacy = { name: nm && nm.length > 2 ? title(nm) : undefined, phone: phone ? `(${phone[1]}) ${phone[2]}-${phone[3]}` : undefined };
  }

  const ind = flat.match(/\b(?:for|indication|used for)\s*:\s*([A-Za-z][A-Za-z ,\-]{3,40}?)(?=\s{2,}|\s+(?:qty|refill|discard|take)\b|$)/i);
  if (ind) r.indication = title(ind[1].trim());

  // summary + warnings
  const add = (label: string, v: unknown) => { if (v !== undefined && v !== "" && v !== null) r.found.push(label); };
  add("name", r.nameCandidates[0]); add("strength", r.strength); add("form", r.form); add("directions", r.directions); add("schedule", r.schedule);
  add("quantity", r.quantity); add("refills", r.refills); add("expiration", r.expires); add("prescriber", r.prescriber); add("pharmacy", r.pharmacy?.name ?? r.pharmacy?.phone);
  if (!r.nameCandidates.length) r.warnings.push("We couldn't find a medicine name. Try a clearer photo of the label, or type the name.");
  if (!r.strength && r.kind !== "supplement") r.warnings.push("We couldn't read the strength. Check it against your bottle.");
  if (r.directions && !r.schedule) r.warnings.push("We read the directions but couldn't turn them into a schedule. Please set the times yourself.");
  if (r.schedule?.kind === "daily" && r.directions && /\bas needed\b|\bprn\b/i.test(r.directions)) r.warnings.push("These directions mention both a schedule and \"as needed\". Please check which applies.");
  return r;
}
