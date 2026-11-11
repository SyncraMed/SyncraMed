// Allowlist data, shared by the server (enforcement) and the app (display on the Sources page). No Node imports here.
export const TRUSTED_SOURCES = [
  // Core drug facts
  { host: "api.fda.gov", name: "openFDA drug labels", use: "fetch" },
  { host: "dailymed.nlm.nih.gov", name: "DailyMed (NLM)", use: "link" },
  { host: "rxnav.nlm.nih.gov", name: "RxNorm (NLM), name matching only", use: "fetch" },
  { host: "connect.medlineplus.gov", name: "MedlinePlus Connect (NLM)", use: "fetch" },
  { host: "medlineplus.gov", name: "MedlinePlus (NLM)", use: "link" },
  { host: "wsearch.nlm.nih.gov", name: "MedlinePlus health topics search (NLM)", use: "fetch" },
  // Supplements
  { host: "ods.od.nih.gov", name: "NIH Office of Dietary Supplements", use: "fetch" },
  { host: "dsldapi.od.nih.gov", name: "NIH Dietary Supplement Label Database", use: "fetch" },
  // Research papers
  { host: "eutils.ncbi.nlm.nih.gov", name: "PubMed (NCBI E-utilities)", use: "fetch" },
  { host: "pubmed.ncbi.nlm.nih.gov", name: "PubMed", use: "link" },
  { host: "pmc.ncbi.nlm.nih.gov", name: "PubMed Central", use: "link" },
  // Provided by the BCBS mentor: aggregate population statistics (reference links only)
  { host: "www.ahrq.gov", name: "AHRQ Data Resources (MEPS)", use: "link" },
  { host: "meps.ahrq.gov", name: "AHRQ Medical Expenditure Panel Survey", use: "link" },
  { host: "www.flhealthcharts.gov", name: "FLHealthCHARTS", use: "link" },
  { host: "www.floridahealth.gov", name: "Florida Dept. of Health Statistics & Data", use: "link" },
  { host: "www.census.gov", name: "U.S. Census Bureau Health Data", use: "link" },
] as const;
