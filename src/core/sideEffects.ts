import type { EducationBundle } from "../../shared/education.js";
import { splitSentences } from "../../shared/words.js";
import type { Medication, SymptomEntry } from "./types.js";

const SYN: Record<string, string[]> = {
  headache: ["headache", "migraine"], nausea: ["nausea", "nauseated"], dizziness: ["dizziness", "dizzy", "lightheaded"],
  fatigue: ["fatigue", "tiredness", "asthenia", "somnolence", "drowsiness"], cough: ["cough"], rash: ["rash", "pruritus", "itching"],
  insomnia: ["insomnia", "sleeplessness"], diarrhea: ["diarrhea"], constipation: ["constipation"], vomiting: ["vomiting"],
  "stomach pain": ["abdominal pain", "stomach pain", "dyspepsia", "gastric"], "dry mouth": ["dry mouth", "xerostomia"],
  "muscle pain": ["myalgia", "muscle pain", "muscle aches"], anxiety: ["anxiety", "nervousness"], "blurred vision": ["blurred vision", "vision"],
  swelling: ["edema", "swelling", "angioedema"], palpitations: ["palpitations", "tachycardia"], "weight gain": ["weight gain"], "hair loss": ["alopecia", "hair loss"],
};

export interface OverlapFlag { medId: string; symptom: string; sentence: string; sourceId: string; bundleKey: string; dates: string[] }

/** "You logged headache on 3 days; the label for X lists headache." Wording is a prompt to ask a clinician, not a cause. */
export function sideEffectOverlap(meds: Medication[], symptoms: SymptomEntry[], bundles: Map<string, { key: string; bundle: EducationBundle }>, sinceDate: string): OverlapFlag[] {
  const recent = symptoms.filter((s) => s.date >= sinceDate);
  const bySym = new Map<string, string[]>();
  for (const e of recent) for (const s of e.symptoms) bySym.set(s.toLowerCase(), [...(bySym.get(s.toLowerCase()) ?? []), e.date]);
  const out: OverlapFlag[] = [];
  for (const m of meds.filter((x) => !x.archived)) {
    const b = bundles.get(m.id);
    if (!b) continue;
    const srcs = b.bundle.sections.filter((s) => s.key === "side_effects" || s.key === "warnings").flatMap((s) => s.blocks.flatMap((x) => x.cites));
    const passages = [...new Set(srcs)].map((id) => b.bundle.sources.find((s) => s.id === id)!).filter(Boolean);
    for (const [sym, dates] of bySym) {
      const terms = SYN[sym] ?? [sym];
      for (const p of passages) {
        const sent = splitSentences(p.text).find((x) => terms.some((t) => x.toLowerCase().includes(t)));
        if (sent) { out.push({ medId: m.id, symptom: sym, sentence: sent.slice(0, 400), sourceId: p.id, bundleKey: b.key, dates: [...new Set(dates)] }); break; }
      }
    }
  }
  return out;
}
export const COMMON_SYMPTOMS = Object.keys(SYN);
