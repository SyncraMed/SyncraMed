import { XMLParser } from "fast-xml-parser";
import { getJson, getText } from "../trusted.js";
import { decodeEntities } from "../text.js";

export interface Paper { pmid: string; title: string; journal: string; year: string; abstract: string; url: string }

const base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const arr = <T,>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const txt = (v: any): string => {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return decodeEntities(String(v));
  if (Array.isArray(v)) return v.map(txt).join(" ");
  return txt(v["#text"] ?? "");
};

export function parsePubmedXml(xml: string): Paper[] {
  const p = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text" });
  const doc = p.parse(xml);
  return arr<any>(doc?.PubmedArticleSet?.PubmedArticle).flatMap((a) => {
    const c = a.MedlineCitation;
    const art = c?.Article;
    const pmid = txt(c?.PMID);
    const parts = arr<any>(art?.Abstract?.AbstractText).map((t) => {
      const label = typeof t === "object" ? t["@_Label"] : undefined;
      return (label ? `${label}: ` : "") + txt(t);
    });
    const abstract = parts.join(" ").trim();
    if (!pmid || !abstract) return [];
    const pd = art?.Journal?.JournalIssue?.PubDate;
    return [{
      pmid, abstract,
      title: txt(art?.ArticleTitle),
      journal: txt(art?.Journal?.Title),
      year: txt(pd?.Year) || txt(pd?.MedlineDate).slice(0, 4),
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    }];
  });
}

/** Top reviews / trials / meta-analyses about the drug, abstracts only. */
export async function searchPubmed(generic: string, apiKey?: string, max = 4): Promise<Paper[]> {
  const g = generic.replace(/["\\]/g, "");
  const term = `"${g}"[Title] AND hasabstract AND humans[MeSH Terms] AND (review[pt] OR "systematic review"[pt] OR meta-analysis[pt] OR "randomized controlled trial"[pt])`;
  const key = apiKey ? `&api_key=${apiKey}` : "";
  const s = await getJson(`${base}/esearch.fcgi?db=pubmed&retmode=json&retmax=${max}&sort=relevance&term=${encodeURIComponent(term)}${key}`);
  const ids: string[] = s?.esearchresult?.idlist ?? [];
  if (!ids.length) return [];
  const xml = await getText(`${base}/efetch.fcgi?db=pubmed&retmode=xml&id=${ids.join(",")}${key}`);
  return xml ? parsePubmedXml(xml) : [];
}
