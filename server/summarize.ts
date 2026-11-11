import { geminiJson } from "./labelai.js";
import type { Block, SectionKey, SourcePassage } from "../shared/education.js";

export type Summarizer = (passages: SourcePassage[], wanted: SectionKey[]) => Promise<{ key: SectionKey; blocks: Block[] }[]>;

const SYSTEM = `You rewrite medical reference passages into plain language (about an 8th-grade reading level) for patients.
RULES:
- Use ONLY the numbered passages provided. Never add facts, numbers, names or advice from your own knowledge.
- Write short bullets: at most 3 per section, each under 25 words, one idea each.
- Every bullet must end with the ids of the passages that support it.
- If the passages do not cover a section, return no bullets for it.
- Do not tell the reader to start, stop or change a medicine. Do not diagnose.
- Return JSON only: {"sections":[{"key":"uses","blocks":[{"text":"...","cites":["S1"]}]}]}`;

/** The model is a rewriting tool, not a knowledge source. This host is intentionally separate from the trusted-source allowlist. */
export function anthropicSummarizer(apiKey: string, model: string): Summarizer {
  return async (passages, wanted) => {
    const body = {
      model, max_tokens: 2500, system: SYSTEM,
      messages: [{
        role: "user",
        content:
          `Sections wanted (keys): ${wanted.join(", ")}\n\nPASSAGES:\n` +
          passages.map((p) => `[${p.id}] (${p.org}; ${p.section ?? p.title}) ${p.text.slice(0, 3500)}`).join("\n\n"),
      }],
    };
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`model request failed: ${r.status}`);
    const j: any = await r.json();
    const text: string = j?.content?.find((c: any) => c.type === "text")?.text ?? "";
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("model returned no JSON");
    return JSON.parse(m[0]).sections ?? [];
  };
}

/** Same job and same rules as above, done by Gemini. The reply is still checked by the caller against the passages. */
export function geminiSummarizer(apiKey: string, model: string): Summarizer {
  return async (passages, wanted) => {
    const user = `Sections wanted (keys): ${wanted.join(", ")}\n\nPASSAGES:\n` +
      passages.map((p) => `[${p.id}] (${p.org}; ${p.section ?? p.title}) ${p.text.slice(0, 3500)}`).join("\n\n");
    const text = await geminiJson(apiKey, model, SYSTEM, user);
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("model returned no JSON");
    return JSON.parse(m[0]).sections ?? [];
  };
}
