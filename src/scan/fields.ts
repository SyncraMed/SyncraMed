// Field finders for the five things a bottle scan looks for. Each one looks for its own label word (with spelling slips
// allowed, because the camera reader often misspells "refills" or "qty"), takes the value next to it, checks the value is
// plausible, and throws away anything that is not part of that field. Nothing else on the label is carried forward.
import { DRUG_NAMES, DRUG_SET } from "../../shared/drugnames";

export function lev(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) { const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); cur.push(v); if (v < best) best = v; }
    if (best > max) return max + 1; prev = cur;
  }
  return prev[b.length];
}

/** Letters only, with the digits a reader confuses for letters turned back (REF1LLS -> refills). */
const letters = (t: string) => t.toLowerCase().replace(/[01 5|$]/g, (c) => ({ "0": "o", "1": "l", "5": "s", "|": "l", "$": "s", " ": "" } as Record<string, string>)[c]).replace(/[^a-z]/g, "");

type Kw = "qty" | "refill" | "other";
export function keyword(tok: string): Kw {
  const l = letters(tok);
  if (l.length < 2) return "other";
  if (/^[qog0a][tli][yv]$/.test(l) || l === "qty" || l === "qnty" || l === "qt" ) return l === "qt" ? "other" : "qty";
  if (lev(l, "quantity", 2) <= 2 && l.length >= 6) return "qty";
  if (l === "disp" || l === "dispensed" || l === "dispense") return "qty";
  if (l.length >= 4 && (lev(l, "refills", 2) <= 2 || lev(l, "refill", 1) <= 1)) return "refill";
  if (l === "rf" || l === "rfs") return "refill";
  return "other";
}

const FILLER = /^(remaining|remain|rem|left|of|total|is|are|authorized|auth|rx|for|by|before|on|after|ea|each|no\.?|number|num|count|ct|#|:|-|=|\/)$/i;
const DATE_TOK = /^\(?\d{1,2}[\/\-.]\d{1,2}([\/\-.]\d{2,4})?\)?[:.,]?$/;
const STOPPER = /^(discard|exp|expires?|expiration|ndc|warning|caution|pharmacy|phone|filled|date|prescriber|doctor|dr\.?|md|physician|take|use|apply|inject)\b/i;
const NUMWORD: Record<string, number> = { none: 0, zero: 0, no: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

interface Tok { t: string; line: number }
const tokenize = (lines: string[]): Tok[] => lines.flatMap((l, i) => l
  .replace(/([A-Za-z)])\s*[:;#]+\s*(?=[\dA-Za-z])/g, "$1: ")                       // "QTY:30" -> "QTY: 30"
  .split(/\s+/).filter(Boolean)
  .flatMap((t) => { const m = /^([A-Za-z]{2,9})(\d{1,4})$/.exec(t); return m && keyword(m[1]) !== "other" ? [m[1], m[2]] : [t]; }) // "REFILLS3" -> "REFILLS" "3"
  .map((t) => ({ t, line: i })));
const core = (t: string) => t.replace(/^[(#\[]+|[)\].,;:]+$/g, "");

/** The number next to a label word: on the same line, or at the start of the next one ("Quantity" then "30"). */
function valueAfter(toks: Tok[], i: number, kind: "qty" | "refill"): number | undefined {
  const startLine = toks[i].line; let skipped = 0;
  for (let j = i + 1; j < toks.length && j <= i + 9; j++) {
    const { t, line } = toks[j]; const c = core(t);
    if (line > startLine + 1) break;
    if (line === startLine + 1 && skipped > 3) break;
    if (keyword(t) !== "other" || STOPPER.test(c)) break;                      // the next label word: this one had no value
    if (DATE_TOK.test(t) || /^(19|20)\d{2}$/.test(c) || /\d{5,}/.test(c)) { skipped++; continue; } // a date, a year, an Rx or phone number
    const low = c.toLowerCase();
    if (kind === "refill" && low in NUMWORD) return NUMWORD[low];
    const m = /^(\d{1,4})$/.exec(c) ?? /^(\d{1,4})(?:tabs?|tablets?|caps?|capsules?|ml|ea)$/i.exec(c);
    if (m) { const n = Number(m[1]); if (kind === "qty" ? n >= 1 && n <= 9999 : n >= 0 && n <= 24) return n; skipped++; continue; }
    if (FILLER.test(c) || c === "") { skipped++; continue; }
    if (kind === "qty" && /^(tablets?|tabs?|capsules?|caps?|ml|ea|pills?|day|days|supply)$/i.test(low)) { skipped++; continue; }
    skipped++; if (skipped > 4) break;
  }
  return undefined;
}

function mostCommon(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const c = new Map<number, number>(); values.forEach((v) => c.set(v, (c.get(v) ?? 0) + 1));
  return [...c.entries()].sort((a, b) => b[1] - a[1] || values.indexOf(a[0]) - values.indexOf(b[0]))[0][0];
}

/** A row of headings over a row of numbers ("QTY  REFILLS" / "30  2"): the numbers go with the headings in order. */
function headingTable(lines: string[], want: "qty" | "refill"): number | undefined {
  for (let i = 0; i + 1 < lines.length; i++) {
    const heads = lines[i].split(/\s+/).filter(Boolean).map((t) => core(t)).filter((t) => t && !FILLER.test(t));
    if (heads.length < 2 || !heads.every((h) => keyword(h) !== "other" || /^(day|days|supply|ds|remaining|left)$/i.test(h))) continue;
    const kinds = heads.map((h) => keyword(h)).filter((k) => k !== "other");
    const nums = lines[i + 1].split(/\s+/).map(core).filter((t) => /^\d{1,4}$/.test(t));
    const at = kinds.indexOf(want); if (at >= 0 && nums.length >= kinds.length) return Number(nums[at]);
  }
  return undefined;
}

/** Headings on their own lines with the numbers on the line below ("QUANTITY" / "REFILLS REMAINING" / "60 5"). */
function stackedTable(lines: string[], want: "qty" | "refill"): number | undefined {
  for (let i = 0; i < lines.length; i++) {
    const kinds: Kw[] = []; let j = i;
    for (; j < lines.length && j < i + 3; j++) {
      const toks = lines[j].split(/\s+/).map(core).filter((t) => t && !FILLER.test(t));
      const ks = toks.map((t) => keyword(t)).filter((k) => k !== "other");
      if (!toks.length || !ks.length || !toks.every((t) => keyword(t) !== "other" || /^(day|days|supply|ds|remaining|left|available)$/i.test(t))) break;
      kinds.push(...ks);
    }
    if (j === i || j >= lines.length) continue;
    const kk = kinds.filter((k, n) => k === "qty" || k === "refill").filter((k, n, a) => a.indexOf(k) === n);
    const nums = lines[j].split(/\s+/).map(core).filter((t) => /^\d{1,4}$/.test(t)).map(Number);
    if (!kk.length || !nums.length) continue;
    const at = kk.indexOf(want); if (at < 0) continue;
    const ok = (n: number) => (want === "refill" ? n <= 24 : n >= 1);
    if (nums.length >= kk.length) return ok(nums[at]) ? nums[at] : undefined;
    if (kk.length === 2 && nums.length === 1 && want === "qty" && nums[0] > 12) return nums[0]; // one number left of two: a big one is the quantity
    if (kk.length === 1) return ok(nums[0]) ? nums[0] : undefined;
  }
  return undefined;
}

export function findQuantity(lines: string[]): number | undefined {
  const toks = tokenize(lines); const found: number[] = [];
  toks.forEach((_, i) => { if (keyword(toks[i].t) === "qty") { const v = valueAfter(toks, i, "qty"); if (v !== undefined) found.push(v); } });
  const flat = lines.join(" ");
  if (!found.length) {
    const m = /\bdisp\w*\s*#\s*(\d{1,4})\b/i.exec(flat) ?? /(?:^|\s)#\s?(\d{2,4})\s+(?:tablets?|tabs?|capsules?|caps)\b/i.exec(flat) ?? /\b(\d{1,4})\s+(?:tablets?|capsules?|caps|tabs)\s+(?:dispensed|total)\b/i.exec(flat);
    if (m) found.push(Number(m[1]));
  }
  // a number that sits just before REFILLS and is too big to be a refill count is the quantity whose "QTY" was not read ("30 REFILLS: 2")
  if (!found.length) toks.forEach((_, i) => { if (i > 0 && keyword(toks[i].t) === "refill") { const p = /^[A-Za-z]{0,3}(\d{2,4})$/.exec(core(toks[i - 1].t)); if (p) p[0] = p[1]; if (p && Number(p[1]) >= 12) found.push(Number(p[0])); } });
  return mostCommon(found) ?? headingTable(lines, "qty") ?? stackedTable(lines, "qty");
}

export function findRefills(lines: string[]): number | undefined {
  const toks = tokenize(lines); const found: number[] = [];
  toks.forEach((_, i) => {
    if (keyword(toks[i].t) !== "refill") return;
    const l = letters(toks[i].t); const bare = l === "rf" || l === "rfs";
    const v = valueAfter(toks, i, "refill");
    if (v !== undefined) { found.push(v); return; }
    if (bare) return;
    const prev = i > 0 ? core(toks[i - 1].t).toLowerCase() : "";                  // "NO REFILLS" / "3 REFILLS REMAINING"
    if (prev === "no" || prev === "zero") { found.push(0); return; }
    if (/^\d{1,2}$/.test(prev) && Number(prev) <= 12 && toks[i - 1].line === toks[i].line) found.push(Number(prev));
  });
  if (!found.length && /\bno\s+refills?\b|\brefills?\W{0,3}\s*(none|nil)\b/i.test(lines.join(" "))) found.push(0);
  if (!found.length) { const m = /\b(?:remaining|left)\s*[:#.]\s*(\d{1,2})\b/i.exec(lines.join(" ")); if (m) found.push(Number(m[1])); }
  return mostCommon(found) ?? headingTable(lines, "refill") ?? stackedTable(lines, "refill");
}

// ---------- directions: keep only words that belong in instructions
const DIR_WORDS = new Set(`take takes use apply inject inhale insert place chew swallow dissolve instill spray sprays rub massage give
tablet tablets tab tabs capsule capsules cap caps pill pills puff puffs drop drops patch patches unit units ml mg mcg gram grams teaspoon teaspoons tsp tablespoon tbsp
by mouth orally oral topically under tongue sublingually nostril nostrils each eye eyes ear ears skin affected area areas rectally vaginally
with without food meal meals water glass full milk empty stomach before after breakfast lunch dinner supper bedtime morning evening night noon afternoon
daily day days weekly week weeks monthly month once twice three four five six times time every other hour hours hrs hr minutes min
as needed directed prn when if may repeat first then increase decrease dose doses total maximum max up to not more than do exceed
for pain nausea fever anxiety sleep blood pressure cholesterol diabetes infection allergies asthma cough headache seizures depression swelling
and or a an the in on at of per into through from also whole half one two ten twelve eight crush break chewed swallowed
continue until gone finished all medication medicine otherwise your doctor tells you at the same time same each every
a.m. p.m. am pm thin layer small amount sparingly generously lightly gently plenty fluids liquid dissolve swallow slowly sip rinse mouth gargle spit patch remove replace
new inhaler nebulizer vial pen injection subcutaneously intramuscularly lower upper left right arm thigh abdomen stomach belly`.split(/\s+/));
const VOWEL = /[aeiouy]/i;
const BLOCK = /^(qty|quantity|refills?|discard|exp|expires?|expiration|ndc|warning|caution|pharmacy|phone|filled|date|prescriber|doctor|dr|md|physician|rx|generic|manufacturer|mfg|lot|call|store|www|http|patient|dispensed|label|keep|children)$/i;

function plausibleWord(w: string): boolean {
  if (w.length < 3 || w.length > 14) return false;
  if (!/^[A-Za-z][A-Za-z'-]*$/.test(w) || !VOWEL.test(w)) return false;
  if (/[^aeiouy]{5,}/i.test(w) || /(.)\1\1/i.test(w)) return false;
  return true;
}

export function cleanDirections(raw: string): string | undefined {
  const toks = raw.replace(/[|_~`"“”]/g, " ").replace(/\b(take|use|apply|inhale|give)(\d)/gi, "$1 $2").replace(/(\d)(tablets?|capsules?|tabs?|caps)\b/gi, "$1 $2").split(/\s+/).filter(Boolean);
  const out: string[] = []; let afterFor = 0;
  const VERB = /^(take|takes|use|apply|inject|inhale|insert|place|chew|swallow|dissolve|instill|spray|rub|massage|give)$/i;
  const v0 = toks.findIndex((t) => VERB.test(t.replace(/[^A-Za-z]/g, "")));
  if (v0 > 0) toks.splice(0, v0);                                    // anything printed before the verb is not part of the directions
  for (const t of toks) {
    const c = t.replace(/^[(\[]+|[)\].,;:!]+$/g, ""); const low = c.toLowerCase().replace(/\.$/, "");
    if (!c) continue;
    if (BLOCK.test(low) || DATE_TOK.test(c) || /\d{5,}/.test(c) || /^\(?\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}$/.test(c)) break;   // the next part of the label: stop here
    const isNum = /^\d+([./-]\d+)?$/.test(c) || /^\d+(\.\d+)?(mg|mcg|ml|g|tabs?|tablets?)$/i.test(c) || /^[½¼¾]$/.test(c);
    const known = DIR_WORDS.has(low) || DIR_WORDS.has(low.replace(/s$/, ""));
    if (low === "for") afterFor = 4;
    if (isNum || known) { out.push(c); if (afterFor && low !== "for") afterFor--; continue; }
    if (afterFor > 0 && plausibleWord(c)) { out.push(c); afterFor--; continue; }                    // "for hypertension"
    // anything else is camera noise ("Iz", "ee", "a_", "xQ7") or text from another part of the label: dropped
  }
  while (out.length && /^(and|or|the|a|an|of|at|in|on|for|with|to|by)$/i.test(out[out.length - 1])) out.pop();      // no dangling word at the end
  { let k = out.length; while (k > 3 && /^\d+$/.test(out[k - 1])) k--;
    if (k < out.length && /^(daily|day|bedtime|morning|evening|night|meals?|stomach|weekly|needed)$/i.test(out[k - 1])) out.length = k; } // "...daily 90 3": numbers from the next line
  if (out.length > 3 && /^day$/i.test(out[out.length - 1]) && /^(morning|evening|bedtime|night|meals?|stomach|daily)$/i.test(out[out.length - 2])) out.pop(); // "DAY SUPPLY" leaking in
  if (out.length < 3 || !out.some((w) => DIR_WORDS.has(w.toLowerCase().replace(/[^a-z]/g, "")))) return undefined;
  const s = out.join(" ");
  return s.length > 160 ? s.slice(0, 160).replace(/\s+\S*$/, "") : s;
}

// ---------- prescriber: one to three name words
const NOT_A_NAME = /^(license|licence|lic|dea|npi|number|no|phone|ph|rx|qty|refills?|filled|date|discard|take|use|pharmacy|store|office|address|name|id|md|do|np|pa|rph|dpm|dds|phd|fnp|aprn|call|for|and|the|of|dispensed|quantity|exp)$/i;
export function cleanPrescriber(raw: string): string | undefined {
  const words = raw.split(/[\s,]+/).map((w) => w.replace(/[^A-Za-z'.\-]/g, "")).filter(Boolean); const keep: string[] = [];
  while (words.length && /^(dr|doctor|prescriber|by|md)\.?$/i.test(words[0])) words.shift();                          // the title is added back later
  for (const w of words) {
    const bare = w.replace(/[.'-]/g, "");
    if (NOT_A_NAME.test(bare)) break;
    const initial = /^[A-Za-z]\.?$/.test(w);
    if (!initial && !(bare.length >= 2 && VOWEL.test(bare) && !/[^aeiouy]{4,}/i.test(bare))) break;   // not a name: stop
    keep.push(w); if (keep.length === 3) break;
  }
  while (keep.length && /^[A-Za-z]\.?$/.test(keep[keep.length - 1]) && keep.length > 1) keep.pop();  // a stray trailing letter
  const name = keep.join(" ").trim();
  return name.replace(/[A-Za-z]/g, "").length === name.length || name.length < 3 ? undefined : name;
}

// ---------- medicine name
const NAME_JUNK = /^(tablets?|tabs?|capsules?|caps?|rx|generic|for|take|by|mouth|the|and|pharmacy|brand|oral|usp|er|xr|sr|dr|hcl|film|coated|each|contains)$/i;
export interface NameFix { name: string; known: boolean }
/** Repair a name the reader spelled a little wrong, using the list of common medicines; drop words that are not part of a name. */
export function fixName(raw: string): NameFix | undefined {
  const words = raw.replace(/[()]/g, " ").split(/\s+/).map((w) => w.replace(/[^A-Za-z'-]/g, "")).filter(Boolean);
  const cand = words.filter((w) => !NAME_JUNK.test(w) && w.length >= 3 && VOWEL.test(w));
  if (!cand.length) return undefined;
  for (const w of cand) {                                                    // the first word that is (or nearly is) a known medicine
    const l = w.toLowerCase();
    if (DRUG_SET.has(l)) return { name: cap(l), known: true };
    const max = l.length >= 9 ? 2 : l.length >= 6 ? 1 : 0;
    if (max) { let best: string | null = null, bd = max + 1; for (const d of DRUG_NAMES) { if (Math.abs(d.length - l.length) > max) continue; const dd = lev(l, d, max); if (dd < bd) { bd = dd; best = d; } } if (best && bd <= max) return { name: cap(best), known: true }; }
  }
  const first = cand.slice(0, 2).filter((w) => plausibleWord(w)); // not a known medicine: keep up to two plausible words, never filler
  return first.length ? { name: first.map((w) => cap(w.toLowerCase())).join(" "), known: false } : undefined;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
