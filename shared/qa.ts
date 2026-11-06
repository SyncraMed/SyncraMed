import type { Block, EducationBundle } from "./education.js";
import { contentWords, splitSentences } from "./words.js";

/** Extractive answer: returns the most relevant sentences from already-retrieved trusted passages, each with its citation. Never generates text. */
export function answerFromSources(question: string, bundle: EducationBundle, max = 3): Block[] {
  const qw = new Set(contentWords(question));
  if (!qw.size) return [];
  const scored: { s: string; id: string; score: number }[] = [];
  for (const src of bundle.sources) {
    for (const s of splitSentences(src.text)) {
      if (s.length < 25 || s.length > 450) continue;
      const w = contentWords(s);
      const hit = w.filter((x) => qw.has(x)).length;
      if (!hit) continue;
      scored.push({ s, id: src.id, score: hit / Math.sqrt(w.length + 3) });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const out: Block[] = [];
  for (const x of scored) {
    if (seen.has(x.s)) continue;
    seen.add(x.s);
    out.push({ text: x.s, cites: [x.id] });
    if (out.length >= max) break;
  }
  return out;
}
