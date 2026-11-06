import type { Block, Section, SectionKey, SourcePassage } from "../shared/education.js";
import { contentWords } from "../shared/words.js";

const NUM = /\b\d+(?:\.\d+)?\s*(?:%|mg|mcg|µg|g|ml|iu|units?|hours?|days?|weeks?|months?)?\b/gi;

/**
 * Deterministic guard for model-rewritten text. A block survives only if
 *  1. it cites at least one real passage id,
 *  2. every number in it appears in a cited passage, and
 *  3. most of its content words appear in the cited passages.
 * This cannot prove a paraphrase is correct; it stops invented facts, figures and sources.
 */
export function validateBlock(block: Block, passages: Map<string, SourcePassage>, minOverlap = 0.55): { ok: boolean; why?: string } {
  if (!block.text?.trim()) return { ok: false, why: "empty" };
  if (!block.cites?.length) return { ok: false, why: "no citation" };
  const cited = block.cites.map((c) => passages.get(c));
  if (cited.some((c) => !c)) return { ok: false, why: "unknown source id" };
  const hay = cited.map((c) => c!.text).join(" ").toLowerCase();

  for (const n of block.text.match(NUM) ?? []) {
    const bare = n.trim().toLowerCase();
    if (!hay.includes(bare) && !hay.includes(bare.replace(/\s+/g, ""))) return { ok: false, why: `number "${bare}" not in cited source` };
  }
  const words = contentWords(block.text);
  if (!words.length) return { ok: false, why: "no content" };
  const hayWords = new Set(contentWords(hay).flatMap((w) => [w, w.replace(/(ing|ed|es|s)$/, "")]));
  const hit = words.filter((w) => hayWords.has(w) || hayWords.has(w.replace(/(ing|ed|es|s)$/, ""))).length;
  if (hit / words.length < minOverlap) return { ok: false, why: "wording drifts from cited source" };
  return { ok: true };
}

export function validateSections(
  proposed: { key: SectionKey; blocks: Block[] }[],
  passages: SourcePassage[],
): { kept: Map<SectionKey, Block[]>; dropped: string[] } {
  const map = new Map(passages.map((p) => [p.id, p]));
  const kept = new Map<SectionKey, Block[]>();
  const dropped: string[] = [];
  for (const s of proposed) {
    const good: Block[] = [];
    for (const b of s.blocks ?? []) {
      const v = validateBlock(b, map);
      if (v.ok) good.push({ text: b.text.trim(), cites: [...new Set(b.cites)] });
      else dropped.push(`${s.key}: ${v.why}`);
    }
    if (good.length) kept.set(s.key, good);
  }
  return { kept, dropped };
}
