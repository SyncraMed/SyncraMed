import { getJson } from "../trusted.js";

export interface Resolved { rxcui: string; name: string; ingredientRxcui?: string; ingredient?: string }

/** RxNorm is used ONLY to match a typed name to a standard concept. It supplies no clinical text. */
export async function resolveName(term: string): Promise<Resolved | null> {
  const a = await getJson(`https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(term)}&maxEntries=1`);
  const rxcui: string | undefined = a?.approximateGroup?.candidate?.[0]?.rxcui;
  if (!rxcui) return null;
  const p = await getJson(`https://rxnav.nlm.nih.gov/REST/rxcui/${rxcui}/properties.json`);
  const name: string = p?.properties?.name ?? term;
  const rel = await getJson(`https://rxnav.nlm.nih.gov/REST/rxcui/${rxcui}/related.json?tty=IN`);
  const ing = rel?.relatedGroup?.conceptGroup?.flatMap((g: any) => g.conceptProperties ?? [])?.[0];
  return { rxcui, name, ingredientRxcui: ing?.rxcui, ingredient: ing?.name };
}
