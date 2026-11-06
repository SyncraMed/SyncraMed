import { setFetchImpl } from "../../server/trusted.js";

export const LISINOPRIL_LABEL = {
  set_id: "abc-123", effective_time: "20250101",
  openfda: { product_type: ["HUMAN PRESCRIPTION DRUG LABEL"], generic_name: ["LISINOPRIL"], brand_name: ["Zestril"], pharm_class_epc: ["Angiotensin Converting Enzyme Inhibitor [EPC]"], rxcui: ["314076"] },
  indications_and_usage: ["1 INDICATIONS AND USAGE Lisinopril tablets are indicated for the treatment of hypertension in adult patients and pediatric patients 6 years of age and older to lower blood pressure. Lowering blood pressure reduces the risk of fatal and nonfatal cardiovascular events, primarily strokes and myocardial infarctions. Lisinopril is also indicated to reduce signs and symptoms of heart failure."],
  dosage_and_administration: ["2 DOSAGE AND ADMINISTRATION The usual initial dose for hypertension is 10 mg once daily. Lisinopril may be taken without regard to meals."],
  adverse_reactions: ["6 ADVERSE REACTIONS The most common adverse reactions are headache, dizziness, cough, and hypotension. Cough is usually dry and persistent."],
  warnings_and_cautions: ["5 WARNINGS AND PRECAUTIONS Angioedema of the face, extremities, lips, tongue, glottis and larynx has been reported. Hyperkalemia may occur."],
  boxed_warning: ["WARNING: FETAL TOXICITY When pregnancy is detected, discontinue lisinopril as soon as possible. Drugs that act directly on the renin-angiotensin system can cause injury and death to the developing fetus."],
  drug_interactions: ["7 DRUG INTERACTIONS Concomitant use with potassium supplements or potassium-sparing diuretics may increase serum potassium. NSAIDs may reduce the antihypertensive effect of lisinopril. Lithium levels may increase."],
};
export const IBUPROFEN_LABEL = {
  set_id: "ibu-1", openfda: { product_type: ["HUMAN PRESCRIPTION DRUG LABEL"], generic_name: ["IBUPROFEN"], brand_name: ["Motrin"], pharm_class_epc: ["Nonsteroidal Anti-inflammatory Drug [EPC]"], rxcui: ["197805"] },
  indications_and_usage: ["Ibuprofen tablets are indicated for relief of the signs and symptoms of rheumatoid arthritis and osteoarthritis, and for relief of mild to moderate pain and primary dysmenorrhea."],
  dosage_and_administration: ["Do not exceed 3200 mg total daily dose. Use the lowest effective dose for the shortest duration."],
  adverse_reactions: ["Common adverse reactions include nausea, heartburn, abdominal pain, headache, dizziness and rash."],
  warnings: ["NSAIDs may cause an increased risk of serious cardiovascular thrombotic events, myocardial infarction, and stroke. NSAIDs cause an increased risk of serious gastrointestinal adverse events including bleeding."],
  boxed_warning: ["WARNING: RISK OF SERIOUS CARDIOVASCULAR AND GASTROINTESTINAL EVENTS Cardiovascular thrombotic events and gastrointestinal bleeding, ulceration, and perforation have been reported."],
  drug_interactions: ["ACE inhibitors: NSAIDs may diminish the antihypertensive effect of ACE inhibitors. Anticoagulants such as warfarin increase the risk of bleeding."],
};
// An unrelated OTC label that a naive limit=1 query could return first.
export const JUNK_LABEL = {
  set_id: "junk-1", openfda: { product_type: ["HUMAN OTC DRUG LABEL"], generic_name: ["LISINOPRIL", "ARNICA MONTANA"], brand_name: ["Homeopathic Kit"] },
  indications_and_usage: ["Condition listed above or as directed by the physician"],
};

const PUBMED_XML = `<?xml version="1.0"?><PubmedArticleSet><PubmedArticle><MedlineCitation><PMID>111222</PMID><Article><Journal><Title>Hypertension Journal</Title><JournalIssue><PubDate><Year>2021</Year></PubDate></JournalIssue></Journal><ArticleTitle>Lisinopril versus placebo in adults with hypertension: a meta-analysis.</ArticleTitle><Abstract><AbstractText Label="BACKGROUND">Lisinopril is widely used.</AbstractText><AbstractText Label="RESULTS">Across 12 trials, systolic blood pressure fell by 8 mmHg more than placebo.</AbstractText></Abstract></Article></MedlineCitation></PubmedArticle></PubmedArticleSet>`;

const ODS_HTML = `<html><body><script>var x=1</script><h2>What is vitamin D and what does it do?</h2><p>Vitamin D is a nutrient found in some foods that is added to others. It helps your body absorb calcium and supports bone health in people of all ages.</p><h2>Can vitamin D be harmful?</h2><p>Yes, when you take too much. Too much vitamin D can raise calcium levels in the blood and cause nausea, vomiting, weakness, and kidney problems.</p><h2>Does vitamin D interact with medications or other dietary supplements?</h2><p>Vitamin D supplements can interact with several types of medicines, including steroids such as prednisone and some weight-loss drugs.</p></body></html>`;

export const calls: string[] = [];
export function installMock(overrides: Record<string, () => Response> = {}) {
  calls.length = 0;
  setFetchImpl(async (url) => {
    calls.push(url);
    for (const [frag, fn] of Object.entries(overrides)) if (url.includes(frag)) return fn();
    const j = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });
    const ibu = /ibuprofen|advil|motrin/i.test(decodeURIComponent(url)) || url.includes("/rxcui/197805/");
    if (url.includes("approximateTerm")) return j({ approximateGroup: { candidate: [{ rxcui: ibu ? "197805" : "314076" }] } });
    if (url.includes("/properties.json")) return j({ properties: { name: ibu ? "ibuprofen 200 MG Oral Tablet" : "lisinopril 10 MG Oral Tablet" } });
    if (url.includes("/related.json")) return j({ relatedGroup: { conceptGroup: [{ conceptProperties: [ibu ? { rxcui: "5640", name: "ibuprofen" } : { rxcui: "29046", name: "lisinopril" }] }] } });
    if (url.includes("api.fda.gov")) return j({ results: ibu ? [IBUPROFEN_LABEL] : [JUNK_LABEL, LISINOPRIL_LABEL] });
    if (url.includes("connect.medlineplus.gov/service")) return j({ feed: { entry: [{ title: { _value: "Lisinopril" }, link: [{ href: "https://medlineplus.gov/druginfo/meds/a692051.html" }], summary: { _value: "<p>Lisinopril is used alone or with other medications to treat high blood pressure. It may also be used after a heart attack.</p>" } }] } });
    if (url.includes("esearch.fcgi")) return j({ esearchresult: { idlist: ["111222"] } });
    if (url.includes("efetch.fcgi")) return new Response(PUBMED_XML, { status: 200 });
    if (url.includes("ods.od.nih.gov")) return new Response(ODS_HTML, { status: 200 });
    return new Response("not found", { status: 404 });
  });
}
