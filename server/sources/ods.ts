import { getText } from "../trusted.js";
import { stripHtml } from "../text.js";

// Slugs checked against https://ods.od.nih.gov/factsheets/list-all/
export const ODS_SHEETS: Record<string, { slug: string; label: string; aliases: string[] }> = {
  vitamin_d: { slug: "VitaminD", label: "Vitamin D", aliases: ["vitamin d", "vitamin d3", "d3", "cholecalciferol"] },
  b12: { slug: "VitaminB12", label: "Vitamin B12", aliases: ["vitamin b12", "b12", "b-12", "cobalamin"] },
  magnesium: { slug: "Magnesium", label: "Magnesium", aliases: ["magnesium"] },
  multi: { slug: "MVMS", label: "Multivitamin/mineral supplements", aliases: ["multivitamin", "multi vitamin", "multi", "multivitamins", "women's multivitamin", "men's multivitamin", "prenatal"] },
  iron: { slug: "Iron", label: "Iron", aliases: ["iron", "ferrous sulfate"] },
  calcium: { slug: "Calcium", label: "Calcium", aliases: ["calcium"] },
  vitamin_c: { slug: "VitaminC", label: "Vitamin C", aliases: ["vitamin c", "ascorbic acid"] },
  omega3: { slug: "Omega3FattyAcids", label: "Omega-3 fatty acids", aliases: ["omega-3", "omega 3", "fish oil"] },
  folate: { slug: "Folate", label: "Folate", aliases: ["folate", "folic acid"] },
  vitamin_a: { slug: "VitaminA", label: "Vitamin A", aliases: ["vitamin a"] },
  vitamin_e: { slug: "VitaminE", label: "Vitamin E", aliases: ["vitamin e"] },
  vitamin_k: { slug: "VitaminK", label: "Vitamin K", aliases: ["vitamin k"] },
  biotin: { slug: "Biotin", label: "Biotin", aliases: ["biotin"] },
  zinc: { slug: "Zinc", label: "Zinc", aliases: ["zinc"] },
};

export function matchSupplement(name: string): string | null {
  const n = name.toLowerCase().replace(/\s+/g, " ").trim();
  for (const [key, s] of Object.entries(ODS_SHEETS)) {
    if (s.aliases.some((a) => n === a || new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(n))) return key;
  }
  return null;
}

export interface OdsSection { heading: string; text: string; role: "uses" | "warnings" | "interactions" | "other" }
export interface OdsResult { title: string; url: string; sections: OdsSection[] }

const roleOf = (heading: string): OdsSection["role"] =>
  /interact/i.test(heading) ? "interactions"
  : /harmful|too much|safety|upper limit|risk/i.test(heading) ? "warnings"
  : /what (is|are)|why do i need|health|used for|benefit|effects/i.test(heading) ? "uses" : "other";

export function extractOdsSections(html: string): OdsSection[] {
  const out: OdsSection[] = [];
  for (const p of html.split(/<h[1-6][^>]*>/i).slice(1)) {
    const [head, ...rest] = p.split(/<\/h[1-6]>/i);
    const heading = stripHtml(head).replace(/\s+/g, " ").trim();
    const body = stripHtml(rest.join(" ")).replace(/\n+/g, " ").trim();
    if (heading && body.length >= 40) out.push({ heading, text: body.slice(0, 3500), role: roleOf(heading) });
  }
  if (out.length) return out;
  // Fallback if headings aren't tagged: ODS headings are questions on their own line.
  const lines = stripHtml(html).split("\n").map((l) => l.trim()).filter(Boolean);
  let cur: { heading: string; text: string[] } | null = null;
  const flush = () => { if (cur) { const text = cur.text.join(" ").trim(); if (text.length >= 40) out.push({ heading: cur.heading, text: text.slice(0, 3500), role: roleOf(cur.heading) }); } };
  for (const l of lines) {
    if (/\?$/.test(l) && l.length < 130) { flush(); cur = { heading: l, text: [] }; } else cur?.text.push(l);
  }
  flush();
  return out;
}

export async function fetchOds(key: string): Promise<OdsResult | null> {
  const s = ODS_SHEETS[key];
  if (!s) return null;
  // Official ODS API (https://ods.od.nih.gov/api/). The public fact-sheet pages return 403 to scripts; the API is meant for apps.
  const api = `https://ods.od.nih.gov/api/index.aspx?resourcename=${s.slug}&readinglevel=Consumer&outputformat=HTML`;
  const url = `https://ods.od.nih.gov/factsheets/${s.slug}-Consumer/`; // the page people can open
  const html = await getText(api);
  if (!html) return null;
  if (process.env.DEBUG_SOURCES) console.error(`[ods] ${url} bytes=${html.length}`);
  const sections = extractOdsSections(html);
  return sections.length ? { title: `${s.label}: Fact Sheet for Consumers`, url, sections } : null;
}
