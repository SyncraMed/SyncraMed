// Turns long, technical source passages into short key points WITHOUT rewriting them:
// each point is a sentence (or clause-trimmed sentence) taken word-for-word from the cited source.
import type { Block, SectionKey } from "../shared/education.js";
import { isNegativeInteraction } from "../shared/negative.js";
import { splitSentences } from "../shared/words.js";

const MAX_CHARS = 210;
const PER_SECTION: Record<SectionKey, number> = { uses: 2, how_to_take: 2, side_effects: 3, warnings: 4, interactions: 3, supplement: 3, evidence: 3 };

/** Trim an over-long sentence at a clause boundary and mark the cut with an ellipsis. The full sentence stays in the source. */
export function clip(s: string, max = MAX_CHARS): string {
  if (s.length <= max) return s;
  const head = s.slice(0, max - 1);
  const cut = Math.max(head.lastIndexOf("; "), head.lastIndexOf(", "), head.lastIndexOf(" and "), head.lastIndexOf(" or "));
  const at = cut > max * 0.5 ? cut : head.lastIndexOf(" ");
  return head.slice(0, at).replace(/[,;:\s]+$/, "") + "…";
}

const SCORE: Partial<Record<SectionKey, (s: string) => number>> = {
  uses: (s) => (/\b(indicated|used (to|for|in)|treatment of|to treat|to lower|to reduce)\b/i.test(s) ? 3 : 0),
  how_to_take: (s) => (/\b\d+(\.\d+)?\s?(mg|mcg|g|ml|units?)\b|once|twice|daily|with or without|with food|with meals|bedtime/i.test(s) ? 3 : 0),
  side_effects: (s) => (/\b(common|most frequent|frequently|incidence|reported)\b/i.test(s) ? 3 : 0) + ((s.match(/,/g) ?? []).length >= 2 ? 2 : 0),
  warnings: (s) => (/\b(serious|risk|may cause|discontinue|fatal|injury|angioedema|hypersensitivity|pregnan|death)\b/i.test(s) ? 3 : 0),
  interactions: (s) => (isNegativeInteraction(s) ? 4 : -5),
  supplement: () => 0,
};

export function keyPoints(text: string, key: SectionKey, max: number): string[] {
  const sents = splitSentences(text).filter((s) => s.length >= 25);
  if (!sents.length) return text.trim() ? [clip(text.trim())] : [];
  const f = SCORE[key] ?? (() => 0);
  return sents
    .map((s, i) => ({ s, i, score: f(s) - i * 0.5 }))
    .sort((a, b) => b.score - a.score).slice(0, max)
    .sort((a, b) => a.i - b.i)
    .map((x) => clip(x.s));
}

/** Blocks that are already short stay as they are; long excerpts become a few key points that keep the same citation. */
export function toBullets(key: SectionKey, blocks: Block[]): Block[] {
  const cap = PER_SECTION[key];
  const derived: Block[] = []; const short: Block[] = [];
  for (const b of blocks) {
    if (b.text.length <= MAX_CHARS) { short.push(b); continue; }
    const m = b.text.match(/^(Boxed warning|Contraindications): /);
    const body = m ? b.text.slice(m[0].length) : b.text;
    keyPoints(body, key, 2).forEach((p, i) => derived.push({ text: i === 0 && m ? `${m[1]}: ${p}` : p, cites: b.cites }));
  }
  // The cap limits points taken from long excerpts; short items (e.g. the MedlinePlus guide link) are always kept.
  return [...derived.slice(0, cap), ...short];
}

/** One research bullet per paper: its title, then the sentence from the abstract that states a result. */
export function paperPoint(abstract: string): string {
  const sents = splitSentences(abstract).filter((s) => s.length >= 25);
  const hit = sents.find((s) => /\b(conclu\w*|result\w*|showed|found|reduc\w*|improv\w*|increas\w*|significant\w*|associated)\b/i.test(s) && /\d/.test(s)) ?? sents.find((s) => /\b(conclu\w*|showed|found|reduc\w*|improv\w*|significant\w*|associated)\b/i.test(s)) ?? sents[sents.length - 1] ?? "";
  return clip(hit, 190);
}
