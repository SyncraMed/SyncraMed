process.env.DEBUG_SOURCES = "1"; // print HTTP status for every source request
// Run on a machine with internet:  npm run verify:sources
// Hits the real trusted sources and reports which ones answered and in the shape the app expects.
import { buildEducation } from "../server/education.js";

let bad = 0;
for (const [q, kind] of [["lisinopril", "drug"], ["Advil", "drug"], ["metformin", "drug"], ["Vitamin D", "supplement"]] as const) {
  const b = await buildEducation(q, { kind, ncbiKey: process.env.NCBI_API_KEY, openfdaKey: process.env.OPENFDA_API_KEY });
  const by = (t: string) => b.sources.filter((s) => s.type === t).length;
  console.log(`${q.padEnd(11)} fda=${by("fda_label")} medlineplus=${by("medlineplus")} pubmed=${by("pubmed")} ods=${by("nih_ods")} sections=${b.sections.filter((s) => s.blocks.length).map((s) => s.key).join(",")}`);
  b.notices.forEach((n) => console.log("   notice:", n));
  const ok = kind === "drug" ? by("fda_label") > 0 : by("nih_ods") > 0;
  if (!ok) { bad++; console.log("   !! primary source returned nothing"); }
}
process.exit(bad ? 1 : 0);
