import type { Block, EducationBundle, Section, SectionKey, SourcePassage } from "../shared/education.js";
import { fetchFdaLabel, type FdaLabel } from "./sources/openfda.js";
import { resolveName } from "./sources/rxnorm.js";
import { fetchMedlinePlus } from "./sources/medlineplus.js";
import { searchPubmed } from "./sources/pubmed.js";
import { fetchOds, matchSupplement, ODS_SHEETS } from "./sources/ods.js";
import { truncateAtSentence } from "./text.js";
import { paperPoint, toBullets } from "./points.js";
import { validateSections } from "./validate.js";
import type { Summarizer } from "./summarize.js";

export interface BuildOptions {
  kind?: "drug" | "supplement";
  openfdaKey?: string;
  ncbiKey?: string;
  summarizer?: Summarizer | null;
  now?: () => Date;
}

const TITLES: Record<SectionKey, string> = {
  uses: "What it's used for",
  how_to_take: "How it's taken (per the label)",
  side_effects: "Possible side effects",
  warnings: "Warnings",
  interactions: "Interactions",
  evidence: "What research says",
  supplement: "About this supplement",
};
const ORDER: SectionKey[] = ["uses", "how_to_take", "side_effects", "warnings", "interactions", "supplement", "evidence"];
const EXCERPT = 750;
/** "METFORMIN HYDROCHLORIDE" -> "metformin": paper titles name the drug, not its salt. */
export const stripSalt = (n: string) => n.toLowerCase().replace(/\b(hydrochloride|hcl|sodium|potassium|sulfate|maleate|tartrate|succinate|mesylate|besylate|acetate|phosphate|calcium|magnesium)\b/g, "").replace(/\s+/g, " ").trim();

export async function buildEducation(queryRaw: string, opts: BuildOptions = {}): Promise<EducationBundle> {
  const query = queryRaw.trim();
  const now = (opts.now ?? (() => new Date()))().toISOString();
  const sources: SourcePassage[] = [];
  const sec = new Map<SectionKey, Block[]>();          // full excerpts, per section
  const bul = new Map<SectionKey, Block[]>();          // short key points, where built directly (research)
  const notices: string[] = [];
  const add = (p: Omit<SourcePassage, "id" | "retrievedAt">): string => {
    const id = `S${sources.length + 1}`;
    sources.push({ ...p, id, retrievedAt: now });
    return id;
  };
  const push = (k: SectionKey, b: Block) => sec.set(k, [...(sec.get(k) ?? []), b]);
  const excerptBlock = (text: string, id: string): Block => ({ text: truncateAtSentence(text, EXCERPT), cites: [id] });

  const suppKey = opts.kind === "drug" ? null : matchSupplement(query);
  const kind: "drug" | "supplement" = opts.kind ?? (suppKey ? "supplement" : "drug");

  let generic: string[] = [], brand: string[] = [], drugClass: string | undefined, rxcui: string | undefined, resolvedName: string | undefined;
  let pubmedTerm = query;

  if (kind === "supplement") {
    const key = suppKey ?? matchSupplement(query);
    const ods = key ? await fetchOds(key) : null;
    if (ods) {
      resolvedName = ods.title.split(":")[0];
      pubmedTerm = resolvedName;
      for (const s of ods.sections) {
        const id = add({ type: "nih_ods", org: "NIH Office of Dietary Supplements", title: ods.title, section: s.heading, url: ods.url, text: s.text });
        if (s.role === "interactions") push("interactions", excerptBlock(s.text, id));
        else if (s.role === "warnings") push("warnings", excerptBlock(s.text, id));
        else if (s.role === "uses") push("supplement", excerptBlock(s.text, id));
      }
    } else if (key) {
      const sheet = ODS_SHEETS[key];
      const id = add({ type: "nih_ods", org: "NIH Office of Dietary Supplements", title: `${sheet.label}: Fact Sheet for Consumers`, section: "Linked, not loaded", url: `https://ods.od.nih.gov/factsheets/${sheet.slug}-Consumer/`,
        text: "The NIH fact sheet for this supplement could not be loaded into the app right now (NIH may block automated requests). Use the button below to read it on the NIH site." });
      push("supplement", { text: `NIH has a consumer fact sheet on ${sheet.label}.`, cites: [id] });
      notices.push("The NIH fact sheet couldn't be loaded into the app, so it is linked instead of summarized.");
    } else {
      notices.push(`No NIH Office of Dietary Supplements fact sheet is available for "${query}" in our source set, so nothing is shown. We don't fill gaps from other sources.`);
    }
  } else {
    const r = await resolveName(query);
    rxcui = r?.rxcui; resolvedName = r?.ingredient ?? r?.name;
    let label: FdaLabel | null = await fetchFdaLabel(r?.ingredient ?? query, opts.openfdaKey);
    if (!label && r?.ingredient) label = await fetchFdaLabel(query, opts.openfdaKey);
    if (label) {
      generic = label.generic; brand = label.brand; drugClass = label.drugClass;
      resolvedName = resolvedName ?? label.generic[0];
      pubmedTerm = r?.ingredient ?? stripSalt(label.generic[0] ?? resolvedName ?? query);
      const url = label.setId ? `https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=${label.setId}` : "https://api.fda.gov/drug/label.json";
      const title = `${(label.brand[0] ?? label.generic[0] ?? query)} FDA drug label`;
      const mk = (section: string, text: string) => add({ type: "fda_label", org: "U.S. Food & Drug Administration (via openFDA/DailyMed)", title, section, url, text: text.slice(0, 8000), meta: { setId: label!.setId ?? "", effective: label!.effective ?? "" } });
      const f = label.fields;
      if (f.indications) push("uses", excerptBlock(f.indications, mk("Indications and usage", f.indications)));
      if (f.dosage) push("how_to_take", excerptBlock(f.dosage, mk("Dosage and administration", f.dosage)));
      if (f.adverse) push("side_effects", excerptBlock(f.adverse, mk("Adverse reactions", f.adverse)));
      if (f.boxed) push("warnings", { text: "Boxed warning: " + truncateAtSentence(f.boxed, EXCERPT), cites: [mk("Boxed warning", f.boxed)] });
      if (f.warnings) push("warnings", excerptBlock(f.warnings, mk("Warnings and precautions", f.warnings)));
      if (f.contraindications) push("warnings", { text: "Contraindications: " + truncateAtSentence(f.contraindications, 450), cites: [mk("Contraindications", f.contraindications)] });
      if (f.interactions) push("interactions", excerptBlock(f.interactions, mk("Drug interactions", f.interactions)));
      else notices.push("This FDA label has no separate drug-interactions section.");
    } else {
      notices.push(`No FDA drug label found for "${query}". Check the spelling, or try the generic name.`);
    }
    const mlp = await fetchMedlinePlus([r?.ingredientRxcui ?? "", r?.rxcui ?? "", ...(label?.rxcuis.slice(0, 3) ?? [])], r?.ingredient ?? r?.name, label?.ndcs ?? []);
    if (mlp) {
      // MedlinePlus drug text is licensed content, and the Connect service only returns a link. We link to it instead of copying it.
      const id = add({ type: "medlineplus", org: "MedlinePlus (National Library of Medicine)", title: mlp.title, section: "Plain-language patient guide", url: mlp.url,
        text: `MedlinePlus has a plain-language patient guide for this medicine: "${mlp.title}". Its text is licensed content, so SyncraMed links to it instead of copying it. Use the button below to read it on MedlinePlus.` });
      push("uses", { text: `Plain-language guide on MedlinePlus: ${mlp.title}.`, cites: [id] });
    }
  }

  // Research: abstracts only, never rewritten.
  const papers = await searchPubmed(pubmedTerm, opts.ncbiKey);
  for (const p of papers) {
    const id = add({ type: "pubmed", org: "PubMed (National Library of Medicine)", title: p.title, section: `${p.journal}${p.year ? ", " + p.year : ""}`, url: p.url, text: p.abstract, meta: { pmid: p.pmid, journal: p.journal, year: p.year } });
    const head = `${p.title.replace(/\.$/, "")} (${p.journal}${p.year ? ", " + p.year : ""})`;
    push("evidence", { text: `${head}. ${truncateAtSentence(p.abstract, 380)}`, cites: [id] });
    bul.set("evidence", [...(bul.get("evidence") ?? []), { text: `${head}. ${paperPoint(p.abstract)}`.trim(), cites: [id] }]);
  }
  if (!papers.length && sources.length) notices.push("No matching research abstracts were retrieved.");

  // Optional plain-language rewrite, validated against the retrieved passages.
  const fullBy = new Map(sec); // keep the long excerpts: the key points are shown first, these on request
  let mode: EducationBundle["mode"] = "extractive";
  if (opts.summarizer && sources.length) {
    try {
      const wanted = ORDER.filter((k) => k !== "evidence" && sec.has(k));
      const proposed = await opts.summarizer(sources.filter((s) => s.type === "fda_label" || s.type === "nih_ods"), wanted);
      const { kept, dropped } = validateSections(proposed.filter((p) => wanted.includes(p.key)), sources);
      for (const [k, blocks] of kept) { sec.set(k, blocks); mode = "summarized"; }
      if (dropped.length) notices.push(`${dropped.length} AI-written sentence(s) were discarded because they could not be matched to a source; verbatim excerpts are shown for those parts.`);
    } catch {
      notices.push("Plain-language rewriting was unavailable; showing verbatim excerpts from the sources.");
    }
  }

  const sections: Section[] = ORDER.flatMap((k): Section[] => {
    const blocks = sec.get(k);
    if (blocks?.length) {
      const summarized = mode === "summarized" && blocks !== fullBy.get(k);
      const points = summarized ? blocks : bul.get(k) ?? toBullets(k, blocks);
      const full = fullBy.get(k);
      return [{ key: k, title: TITLES[k], blocks: points, full: full && full.map((b) => b.text).join(" ") !== points.map((b) => b.text).join(" ") ? full : undefined }];
    }
    if (k === "supplement" && kind === "drug") return [];
    if (k === "evidence" || (k === "supplement")) return [];
    if (!sources.length) return [];
    return [{ key: k, title: TITLES[k], blocks: [], missing: "Not stated in the available trusted sources." }];
  });

  return { query, kind, resolvedName, rxcui, genericNames: generic, brandNames: brand, drugClass, fetchedAt: now, mode, sections, sources, notices };
}
