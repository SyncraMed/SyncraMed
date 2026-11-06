// Types shared by the server (builds bundles) and the client (renders them).
export type SourceType = "fda_label" | "medlineplus" | "pubmed" | "nih_ods";

export interface SourcePassage {
  id: string;              // "S1", "S2" ... stable within a bundle
  type: SourceType;
  org: string;             // "U.S. Food & Drug Administration"
  title: string;
  section?: string;        // e.g. "Indications and usage"
  url: string;             // original page, opened only when the user asks
  text: string;            // the exact retrieved text shown in the in-app source reader
  retrievedAt: string;     // ISO date
  meta?: Record<string, string>; // pmid, journal, year, setId...
}

export interface Block { text: string; cites: string[] }          // cites are SourcePassage ids
export interface Section {
  key: SectionKey; title: string;
  blocks: Block[];          // short key points, each with its source paperclip(s)
  full?: Block[];           // the longer excerpts the key points were taken from (shown on request)
  missing?: string;
}
export type SectionKey = "uses" | "how_to_take" | "side_effects" | "warnings" | "interactions" | "evidence" | "supplement";

export interface EducationBundle {
  query: string;
  kind: "drug" | "supplement";
  resolvedName?: string;
  rxcui?: string;
  genericNames: string[];
  brandNames: string[];
  drugClass?: string;
  fetchedAt: string;
  mode: "extractive" | "summarized";   // summarized = model rewrote passages, then validated
  sections: Section[];
  sources: SourcePassage[];
  notices: string[];                    // honest limits, e.g. "No FDA label found"
}

export interface QuestionVerdict {
  category: "educational" | "actionable" | "emergency";
  reason: string;
}
