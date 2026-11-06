import { XMLParser } from "fast-xml-parser";
import { guardedFetch, UntrustedHostError } from "../trusted.js";
import { stripHtml } from "../text.js";

export interface MlpResult { title: string; url: string; text: string }

const arr = <T,>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const val = (v: any): string => (v == null ? "" : typeof v === "string" ? v : String(v._value ?? v["#text"] ?? ""));

/** Reads either the JSON or the Atom XML form of a Connect response. */
export function parseConnect(body: string): MlpResult | null {
  let entry: any;
  const t = body.trim();
  if (t.startsWith("{")) { try { entry = arr<any>(JSON.parse(t)?.feed?.entry)[0]; } catch { /* fall through */ } }
  else if (t.startsWith("<")) { entry = arr<any>(new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text" }).parse(t)?.feed?.entry)[0]; }
  if (!entry) return null;
  const link = arr<any>(entry.link)[0];
  // For drug requests the service returns a title and a link to the MedlinePlus page, with no summary text.
  const url: string | undefined = typeof link === "string" ? link : link?.href ?? link?.["@_href"];
  if (!url) return null;
  return { title: val(entry.title) || "MedlinePlus drug information", url, text: stripHtml(val(entry.summary)) };
}

const RXNORM_OID = "2.16.840.1.113883.6.88";
const NDC_OID = "2.16.840.1.113883.6.69";

/** MedlinePlus Connect: patient-friendly drug summary by RxCUI or NDC. NLM asks implementers to cache 12-24h and stay under 100 req/min. */
export async function fetchMedlinePlus(rxcuis: string[], name?: string, ndcs: string[] = []): Promise<MlpResult | null> {
  const codes = [...[...new Set(rxcuis.filter(Boolean))].map((c) => ({ cs: RXNORM_OID, c })), ...ndcs.slice(0, 3).map((c) => ({ cs: NDC_OID, c }))];
  for (const { cs, c } of codes) {
    for (const withName of [true, false]) {
      const u =
        `https://connect.medlineplus.gov/service?mainSearchCriteria.v.cs=${cs}&mainSearchCriteria.v.c=${encodeURIComponent(c)}` +
        (withName && name ? `&mainSearchCriteria.v.dn=${encodeURIComponent(name)}` : "") +
        `&informationRecipient.languageCode.c=en&knowledgeResponseType=application/json`;
      try {
        const r = await guardedFetch(u, { headers: { Accept: "application/json" } });
        const body = await r.text();
        const parsed = r.ok ? parseConnect(body) : null;
        if (parsed) return parsed;
        if (process.env.DEBUG_SOURCES) console.error(`[mlp] no match for ${c} (${withName ? "with" : "no"} name): ${body.replace(/\s+/g, " ").slice(0, 260)}`);
      } catch (e) { if (e instanceof UntrustedHostError) throw e; }
    }
  }
  return null;
}
