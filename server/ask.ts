// "Ask SyncraMed": a chat that can answer ANY medicine or health-education question, but only from sources it just retrieved from the
// trusted list (FDA labels, MedlinePlus, NIH supplement fact sheets, PubMed). The AI model is a rewriting tool: it sees only the retrieved
// passages, every sentence it writes must cite one, and every sentence is checked against those passages. If nothing verified is found,
// it says so instead of answering from its own knowledge.
import { ASK_DISCLAIMER, type AskResponse } from "../shared/ask.js";
import type { Block, SourcePassage } from "../shared/education.js";
import { DRUG_NAMES, DRUG_SET } from "../shared/drugnames.js";
import { ACTIONABLE_MESSAGE, EMERGENCY_MESSAGE, classifyQuestion } from "../shared/safety.js";
import { contentWords, splitSentences } from "../shared/words.js";
import { buildEducation } from "./education.js";
import { ODS_SHEETS, matchSupplement } from "./sources/ods.js";
import { searchHealthTopics } from "./sources/healthtopics.js";
import { validateBlock } from "./validate.js";
import { truncateAtSentence } from "./text.js";

export type Llm = (system: string, user: string) => Promise<string>;
export interface AskOptions { llm?: Llm | null; openfdaKey?: string; ncbiKey?: string; meds?: string[]; previous?: string[]; now?: () => Date }

const SYSTEM = `You answer patients' questions about medicines and health in plain language (about an 8th-grade reading level), using ONLY the numbered source passages provided.
RULES:
- Never use your own knowledge. Every fact, number and name must come from the passages.
- Answer the question directly in 2 to 5 short sentences, each under 30 words, each ending with the ids of the passages that support it.
- If the passages do not contain the answer, return {"covered": false, "answer": []}. Do not guess or partly answer from memory.
- Never tell the person to start, stop, skip or change a medicine or dose, and never diagnose. If the question is about what the person personally should do, give only the general information in the passages.
- Return JSON only: {"covered": true, "answer": [{"text": "...", "cites": ["S1"]}]}`;

const lev1 = (a: string, b: string): boolean => {   // true when a and b differ by at most one edit
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (a.length < b.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
};

/** Medicine / supplement names mentioned in the question, plus the person's own list when the question is about "my medicines". */
export function detectTopics(q: string, meds: string[] = [], previous: string[] = []): string[] {
  const out: string[] = []; const add = (n: string) => { const k = n.toLowerCase(); if (k && !out.some((o) => o.toLowerCase() === k)) out.push(n); };
  const words = q.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? [];
  for (const w of words) {
    if (DRUG_SET.has(w)) { add(w); continue; }
    if (w.length >= 7) { const near = DRUG_NAMES.find((d) => d.length >= 7 && lev1(w, d)); if (near) add(near); }
  }
  const supp = matchSupplement(q); if (supp) add(ODS_SHEETS[supp].label);
  const about = /\b(my|our)\s+(other\s+)?(meds?|medications?|medicines?|pills|prescriptions?|supplements?)\b|\b(all|each) (of )?(my|the) (meds|medications|medicines)\b|\binteract/i.test(q);
  if (about) for (const m of meds.slice(0, 4)) add(m);
  if (!out.length) for (const p of previous.slice(0, 2)) add(p);                // a follow-up such as "what about side effects?"
  return out.slice(0, 3);
}

const GENERIC = new Set("tell know drug drugs medication medications medicine medicines pill pills tablet tablets take taking taken used use uses safe much long many day days anything thing things explain please also work works does doctor give given need needs would could really just like want about".split(" "));
const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, "");

interface Chunk { src: SourcePassage; text: string; score: number }

function chunksOf(src: SourcePassage): string[] {
  const sents = splitSentences(src.text).filter((s) => s.length >= 20); const out: string[] = [];
  for (let i = 0; i < sents.length; i += 2) out.push(truncateAtSentence(sents.slice(i, i + 3).join(" "), 900));
  return out;
}

export async function answerQuestion(questionRaw: string, opts: AskOptions = {}): Promise<AskResponse> {
  const question = questionRaw.trim().slice(0, 400);
  const fetchedAt = (opts.now ?? (() => new Date()))().toISOString();
  const base = { question, sources: [] as SourcePassage[], topics: [] as string[], notices: [] as string[], disclaimer: ASK_DISCLAIMER, fetchedAt };
  const verdict = classifyQuestion(question);
  if (verdict.category === "emergency") return { ...base, category: "emergency", answer: [], mode: "none", banner: EMERGENCY_MESSAGE };
  const banner = verdict.category === "actionable" ? ACTIONABLE_MESSAGE : undefined;

  // 1. find the medicines the question is about
  const topics = detectTopics(question, opts.meds, opts.previous);
  const pool: SourcePassage[] = [];
  const seen = new Set<string>();
  const take = (ps: SourcePassage[]) => { for (const p of ps) { const k = `${p.url}|${p.section ?? ""}|${p.title}`; if (!seen.has(k) && p.text.trim().length > 40) { seen.add(k); pool.push(p); } } };

  // 2. retrieve from the trusted sources only (every request is checked against the allowlist in trusted.ts)
  const qWordsAll = contentWords(question);
  const lowTopics = new Set(topics.flatMap((t) => t.toLowerCase().split(/\W+/)));
  const qWords = [...new Set(qWordsAll.filter((w) => !lowTopics.has(w) && !GENERIC.has(w)).map(stem))];
  const [bundles, health] = await Promise.all([
    Promise.all(topics.map((t) => buildEducation(t, { openfdaKey: opts.openfdaKey, ncbiKey: opts.ncbiKey }).catch(() => null))),
    searchHealthTopics([...topics, ...qWordsAll.filter((w) => !lowTopics.has(w) && !GENERIC.has(w))].slice(0, 8).join(" ")).catch(() => []),
  ]);
  for (const b of bundles) if (b) take(b.sources);
  for (const h of health) take([{ id: "x", type: "medlineplus", org: "MedlinePlus (National Library of Medicine)", title: h.title, section: "Health topic", url: h.url, text: h.text, retrievedAt: fetchedAt }]);
  if (!pool.length) {
    const none = topics.length ? `No trusted source was found for "${topics.join(", ")}". Check the spelling or try the generic name.` : "No trusted source was found for that question.";
    return { ...base, topics, category: verdict.category, answer: [], mode: "none", banner, notices: [none, "SyncraMed does not answer from the AI's own knowledge, so nothing is shown. Ask your pharmacist or doctor."] };
  }

  // 3. pick the passages most relevant to the question
  const topicBoost = (t: string) => (topics.some((n) => t.toLowerCase().includes(n.toLowerCase().split(" ")[0])) ? 0.15 : 0);
  const chunks: Chunk[] = pool.flatMap((src) => chunksOf(src).map((text) => {
    const ws = contentWords(text).map(stem); const set = new Set(ws);
    const hit = qWords.filter((w) => set.has(w)).length;
    return { src, text, score: (qWords.length ? hit / qWords.length : 0.1) + topicBoost(text) + (src.type === "medlineplus" ? 0.02 : 0) - ws.length / 4000, hit } as Chunk & { hit: number };
  }));
  const relevant = (c: Chunk) => !qWords.length || (c as Chunk & { hit: number }).hit > 0;
  const ranked = chunks.filter(relevant).sort((a, b) => b.score - a.score);
  const perSrc = new Map<SourcePassage, number>(); const picked: Chunk[] = [];
  for (const c of ranked) { const n = perSrc.get(c.src) ?? 0; if (n >= 2) continue; perSrc.set(c.src, n + 1); picked.push(c); if (picked.length >= 7) break; }
  if (!picked.length) {
    return { ...base, topics, category: verdict.category, answer: [], mode: "none", banner,
      sources: pool.slice(0, 4).map((p, i) => ({ ...p, id: `S${i + 1}` })),
      notices: ["We found sources about this topic, but none of them addresses your question, so SyncraMed is not answering it. Ask your pharmacist or doctor."] };
  }
  // renumber: S1.. in order of first use; the model sees exactly these excerpts
  const order: SourcePassage[] = []; for (const c of picked) if (!order.includes(c.src)) order.push(c.src);
  const idOf = new Map(order.map((s, i) => [s, `S${i + 1}`]));
  const shown: SourcePassage[] = order.map((s) => ({ ...s, id: idOf.get(s)!, text: s.text.slice(0, 6000) }));
  const excerpt = new Map<string, string>(); for (const c of picked) excerpt.set(idOf.get(c.src)!, `${excerpt.get(idOf.get(c.src)!) ?? ""} ${c.text}`.trim());
  const check = new Map<string, SourcePassage>(shown.map((s) => [s.id, { ...s, text: excerpt.get(s.id)! }]));

  // 4. write the answer (AI rewrite, checked) or fall back to verbatim sentences
  let answer: Block[] = []; let mode: AskResponse["mode"] = "excerpt"; const notices: string[] = []; let modelSaidNo = false;
  if (opts.llm) {
    try {
      const user = `QUESTION: ${question}\n\nPASSAGES:\n` + [...check.values()].map((s) => `[${s.id}] (${s.org}; ${s.section ?? s.title}) ${s.text}`).join("\n\n");
      const raw = await opts.llm(SYSTEM, user); const m = raw.match(/\{[\s\S]*\}/); if (!m) throw new Error("no json");
      const j = JSON.parse(m[0]) as { covered?: boolean; answer?: Block[] };
      if (j.covered === false && !(j.answer?.length)) modelSaidNo = true;
      const good: Block[] = []; let dropped = 0;
      for (const b of (Array.isArray(j.answer) ? j.answer : []).slice(0, 6)) {
        const blk: Block = { text: String(b?.text ?? "").trim(), cites: Array.isArray(b?.cites) ? b.cites.map(String) : [] };
        if (validateBlock(blk, check).ok) good.push(blk); else dropped++;
      }
      if (dropped) notices.push(`${dropped} AI-written sentence(s) were discarded because they could not be matched to a source.`);
      if (good.length) { answer = good; mode = "ai"; }
    } catch { notices.push("Plain-language rewriting was unavailable, so word-for-word source sentences are shown."); }
  }
  if (!answer.length && !modelSaidNo) {
    const qset = new Set(qWords);
    const sents = [...check.values()].flatMap((s) => splitSentences(s.text).filter((x) => x.length >= 25 && x.length <= 450).map((x) => ({ x, id: s.id, hit: contentWords(x).map(stem).filter((w) => qset.has(w)).length })));
    sents.sort((a, b) => b.hit - a.hit);
    const seenS = new Set<string>();
    for (const s of sents) { if ((qset.size && !s.hit) || seenS.has(s.x)) continue; seenS.add(s.x); answer.push({ text: s.x, cites: [s.id] }); if (answer.length >= 3) break; }
    mode = answer.length ? "excerpt" : "none";
  }
  if (modelSaidNo || !answer.length) {
    return { ...base, topics, category: verdict.category, answer: [], mode: "none", banner, sources: shown,
      notices: [...notices, "The sources we found don't directly answer that question, so SyncraMed is not answering it. They are listed below if you want to read them. Ask your pharmacist or doctor."] };
  }
  return { ...base, topics, category: verdict.category, answer, mode, banner, sources: shown, notices };
}
