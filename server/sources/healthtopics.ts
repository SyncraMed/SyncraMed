import { XMLParser } from "fast-xml-parser";
import { guardedFetch, UntrustedHostError } from "../trusted.js";
import { stripHtml, truncateAtSentence } from "../text.js";

export interface HealthTopic { title: string; url: string; text: string }
const arr = <T,>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const val = (v: any): string => (v == null ? "" : typeof v === "string" || typeof v === "number" ? String(v) : String(v["#text"] ?? ""));

export function parseHealthTopics(xml: string): HealthTopic[] {
  const doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text" }).parse(xml);
  return arr<any>(doc?.nlmSearchResult?.list?.document).flatMap((d) => {
    const url: string = d["@_url"] ?? ""; if (!/^https:\/\/medlineplus\.gov\//.test(url)) return [];
    const c: Record<string, string> = {}; for (const x of arr<any>(d.content)) c[x["@_name"]] = val(x);
    const title = stripHtml(c.title ?? ""); const text = stripHtml(c.FullSummary || c.snippet || "");
    return title && text ? [{ title, url, text }] : [];
  });
}

/** MedlinePlus health topics (NLM): plain-language pages on conditions, symptoms and safety. */
export async function searchHealthTopics(term: string, max = 2): Promise<HealthTopic[]> {
  try {
    const r = await guardedFetch(`https://wsearch.nlm.nih.gov/ws/query?db=healthTopics&retmax=${max}&term=${encodeURIComponent(term.slice(0, 200))}`);
    if (!r.ok) return [];
    return parseHealthTopics(await r.text()).slice(0, max).map((t) => ({ ...t, text: truncateAtSentence(t.text, 2500) }));
  } catch (e) { if (e instanceof UntrustedHostError) throw e; return []; }
}
