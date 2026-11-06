import type { EducationBundle } from "../../shared/education.js";
import { splitSentences } from "../../shared/words.js";
import type { Medication } from "./types.js";

export interface InteractionFlag {
  a: string; b: string;           // medication ids: label of `a` mentions `b`
  term: string;                   // what matched
  sentence: string;               // exact sentence from the trusted source
  sourceId: string;
  bundleKey: string;
  strong: boolean;                // label says avoid / contraindicated / not recommended, vs. monitor / may change effect
}

// Label text usually names classes ("NSAIDs", "potassium supplements") rather than every brand.
const CLASS_TERMS: Record<string, string[]> = {
  nsaid: ["ibuprofen", "naproxen", "aspirin", "advil", "motrin", "aleve", "diclofenac", "celecoxib", "meloxicam"],
  potassium: ["potassium chloride", "potassium"],
  "vitamin k": ["vitamin k"],
  calcium: ["calcium"],  // "calcium channel blockers" is a different thing and is excluded in the matcher below
  magnesium: ["magnesium"],
  iron: ["iron", "ferrous sulfate"],
  zinc: ["zinc"],
  "st. john": ["st. john", "st john"],
  antacid: ["tums", "calcium carbonate", "magnesium hydroxide", "aluminum hydroxide"],
};

export function namesFor(med: Medication, bundle?: EducationBundle): string[] {
  const n = new Set<string>();
  const add = (s?: string) => { const t = s?.toLowerCase().trim(); if (t && t.length > 2) n.add(t); };
  add(med.name);
  bundle?.genericNames.forEach(add); bundle?.brandNames.slice(0, 4).forEach(add); add(bundle?.resolvedName);
  const base = [...n];
  for (const [cls, members] of Object.entries(CLASS_TERMS)) if (members.some((m) => base.some((b) => b.includes(m)))) n.add(cls);
  return [...n];
}

import { STRONG, isNegativeInteraction } from "../../shared/negative.js";
export { isNegativeInteraction };

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Reports an interaction only when one medicine's FDA label, in its Drug Interactions text, names the other medicine (or its class)
 * in a sentence describing an unwanted effect. It reports what the label says; it will miss interactions the label doesn't name.
 */
export function scanInteractions(meds: Medication[], bundles: Map<string, { key: string; bundle: EducationBundle }>): InteractionFlag[] {
  const active = meds.filter((m) => !m.archived);
  const flags: InteractionFlag[] = [];
  const seen = new Set<string>();
  for (const a of active) {
    const ba = bundles.get(a.id);
    if (!ba) continue;
    const own = new Set(namesFor(a, ba.bundle));
    // Only the label's own "Drug interactions" text (and NIH's supplement interaction answers) counts as an interaction statement.
    // General warnings are not used: they mention other drugs in many unrelated ways.
    const texts = ba.bundle.sources.filter((s) => (s.type === "fda_label" || s.type === "nih_ods") && /interact/i.test(s.section ?? ""));
    for (const b of active) {
      if (a.id === b.id) continue;
      const terms = namesFor(b, bundles.get(b.id)?.bundle).filter((t) => t.length > 3);
      if (terms.some((t) => own.has(t))) continue; // same ingredient listed twice, not an interaction
      for (const src of texts) {
        const names = (sent: string, t: string) => new RegExp(`\\b${esc(t)}s?\\b(?!\\s+channel)`, "i").test(sent);
        const hit = splitSentences(src.text).find((sent) => isNegativeInteraction(sent) && terms.some((t) => names(sent, t)));
        if (!hit) continue;
        const term = terms.find((t) => names(hit, t))!;
        const k = `${a.id}>${b.id}`;
        if (seen.has(k)) break;
        seen.add(k);
        flags.push({ a: a.id, b: b.id, term, sentence: hit.slice(0, 400), sourceId: src.id, bundleKey: ba.key, strong: STRONG.test(hit) });
        break;
      }
    }
  }
  return flags;
}
