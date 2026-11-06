import { describe, it, expect, beforeEach } from "vitest";
import { installMock, calls } from "./fixtures/mock.js";
import { buildEducation } from "../server/education.js";
import { guardedFetch, UntrustedHostError, assertFetchable } from "../server/trusted.js";
import { validateBlock } from "../server/validate.js";
import { classifyQuestion } from "../shared/safety.js";
import { answerFromSources } from "../shared/qa.js";
import { matchSupplement } from "../server/sources/ods.js";

beforeEach(() => installMock());

describe("trusted-source allowlist", () => {
  it("blocks any host that is not on the list", async () => {
    await expect(guardedFetch("https://example.com/x")).rejects.toBeInstanceOf(UntrustedHostError);
    await expect(guardedFetch("https://www.webmd.com/drugs")).rejects.toBeInstanceOf(UntrustedHostError);
    expect(() => assertFetchable("http://api.fda.gov/drug/label.json")).toThrow(); // https only
  });
  it("blocks link-only hosts from being fetched", () => {
    expect(() => assertFetchable("https://www.census.gov/topics/health/data.html")).toThrow();
  });
  it("only ever contacts allowlisted hosts while building a bundle", async () => {
    await buildEducation("lisinopril");
    expect(calls.length).toBeGreaterThan(3);
    for (const c of calls) expect(() => assertFetchable(c)).not.toThrow();
  });
});

describe("drug education", () => {
  it("picks the real prescription label over an unrelated OTC one", async () => {
    const b = await buildEducation("lisinopril");
    const uses = b.sections.find((s) => s.key === "uses")!;
    expect(uses.blocks[0].text).toMatch(/hypertension/i);
    expect(b.genericNames).toContain("LISINOPRIL");
    expect(b.drugClass).toMatch(/ACE|Angiotensin/i);
  });
  it("gives every block a citation that points at a real retrieved source", async () => {
    const b = await buildEducation("lisinopril");
    const ids = new Set(b.sources.map((s) => s.id));
    for (const s of b.sections) for (const bl of s.blocks) { expect(bl.cites.length).toBeGreaterThan(0); for (const c of bl.cites) expect(ids.has(c)).toBe(true); }
    expect(b.sources.map((s) => s.type)).toEqual(expect.arrayContaining(["fda_label", "medlineplus", "pubmed"]));
  });
  it("includes boxed warning, interactions and PubMed evidence with PMID links", async () => {
    const b = await buildEducation("lisinopril");
    expect(b.sections.find((s) => s.key === "warnings")!.blocks[0].text).toMatch(/Boxed warning/);
    expect(b.sections.find((s) => s.key === "interactions")!.blocks[0].text).toMatch(/potassium/i);
    const ev = b.sections.find((s) => s.key === "evidence")!;
    expect(ev.blocks[0].text).toMatch(/meta-analysis/i);
    expect(b.sources.find((s) => s.type === "pubmed")!.url).toBe("https://pubmed.ncbi.nlm.nih.gov/111222/");
  });
  it("says so honestly when nothing is found, and invents nothing", async () => {
    installMock({ "api.fda.gov": () => new Response("{}", { status: 404 }), "connect.medlineplus": () => new Response("", { status: 404 }), "esearch": () => new Response("{}", { status: 404 }) });
    const b = await buildEducation("zzzzqx");
    expect(b.sources).toHaveLength(0);
    expect(b.sections).toHaveLength(0);
    expect(b.notices.join(" ")).toMatch(/No FDA drug label found/);
  });
});

describe("supplement education", () => {
  it("matches common names and answers only from NIH ODS", async () => {
    expect(matchSupplement("Vitamin D3")).toBe("vitamin_d");
    expect(matchSupplement("women's multivitamin")).toBe("multi");
    expect(matchSupplement("500 mg tablet")).toBeNull();
    const b = await buildEducation("vitamin d");
    expect(b.kind).toBe("supplement");
    expect(b.sources.some((s) => s.type === "nih_ods")).toBe(true);
    expect(b.sources.some((s) => s.type === "fda_label")).toBe(false);
    expect(b.sections.find((s) => s.key === "interactions")!.blocks[0].text).toMatch(/prednisone/);
  });
  it("returns a notice for a supplement with no NIH fact sheet", async () => {
    const b = await buildEducation("some herbal blend", { kind: "supplement" });
    expect(b.notices.join(" ")).toMatch(/No NIH Office of Dietary Supplements/);
  });
});

describe("AI rewrite validation", () => {
  const passages = [{ id: "S1", type: "fda_label" as const, org: "FDA", title: "t", url: "u", retrievedAt: "", text: "The usual initial dose for hypertension is 10 mg once daily. The most common reactions are headache, dizziness and cough." }];
  const map = new Map(passages.map((p) => [p.id, p]));
  it("accepts a faithful paraphrase", () => {
    expect(validateBlock({ text: "Common reactions include headache, dizziness and cough.", cites: ["S1"] }, map).ok).toBe(true);
  });
  it("rejects a sentence with no citation, a fake id, or an invented number", () => {
    expect(validateBlock({ text: "It causes headache.", cites: [] }, map).ok).toBe(false);
    expect(validateBlock({ text: "It causes headache.", cites: ["S9"] }, map).ok).toBe(false);
    expect(validateBlock({ text: "The usual dose is 40 mg once daily.", cites: ["S1"] }, map).why).toMatch(/number/);
  });
  it("rejects claims whose wording is not in the cited source", () => {
    expect(validateBlock({ text: "Grapefruit juice strongly increases kidney damage risk.", cites: ["S1"] }, map).ok).toBe(false);
  });
  it("falls back to verbatim excerpts if the model invents things or fails", async () => {
    const bad = async () => [{ key: "uses" as const, blocks: [{ text: "Cures diabetes in 3 days.", cites: ["S1"] }] }];
    const b = await buildEducation("lisinopril", { summarizer: bad });
    expect(b.mode).toBe("extractive");
    expect(b.sections.find((s) => s.key === "uses")!.blocks[0].text).toMatch(/hypertension/i);
    expect(b.notices.join(" ")).toMatch(/discarded/);
    const boom = async () => { throw new Error("down"); };
    const c = await buildEducation("lisinopril", { summarizer: boom });
    expect(c.mode).toBe("extractive");
  });
  it("keeps a faithful model rewrite and marks the bundle as summarized", async () => {
    const good = async () => [{ key: "uses" as const, blocks: [{ text: "Lisinopril is used to treat hypertension and to lower blood pressure.", cites: ["S1"] }] }];
    const b = await buildEducation("lisinopril", { summarizer: good });
    expect(b.mode).toBe("summarized");
    expect(b.sections.find((s) => s.key === "uses")!.blocks[0].text).toMatch(/lower blood pressure/);
  });
});

describe("safety layer", () => {
  it("separates educational, actionable and emergency questions", () => {
    expect(classifyQuestion("What are common side effects of lisinopril?").category).toBe("educational");
    expect(classifyQuestion("Should I stop taking lisinopril?").category).toBe("actionable");
    expect(classifyQuestion("Can I take ibuprofen with it?").category).toBe("actionable");
    expect(classifyQuestion("I think I took too much, overdose?").category).toBe("emergency");
    expect(classifyQuestion("Is it safe to take while pregnant").category).toBe("actionable");
  });
  it("answers only with cited sentences from retrieved sources", async () => {
    const b = await buildEducation("lisinopril");
    const a = answerFromSources("does it cause a cough or dizziness", b);
    expect(a.length).toBeGreaterThan(0);
    for (const x of a) expect(b.sources.find((s) => s.id === x.cites[0])!.text).toContain(x.text);
  });
});

import { parseConnect } from "../server/sources/medlineplus.js";
import { stripSalt } from "../server/education.js";
describe("live-response hardening", () => {
  it("parses MedlinePlus Connect in JSON and Atom XML form", () => {
    const j = parseConnect(JSON.stringify({ feed: { entry: [{ title: { _value: "Lisinopril" }, link: [{ href: "https://medlineplus.gov/druginfo/meds/a692051.html" }], summary: { _value: "<p>Treats high blood pressure.</p>" } }] } }));
    expect(j?.text).toBe("Treats high blood pressure.");
    const x = parseConnect(`<feed xmlns="http://www.w3.org/2005/Atom"><entry><title type="text">Lisinopril</title><link rel="alternate" href="https://medlineplus.gov/druginfo/meds/a692051.html"/><summary type="html">&lt;p&gt;Treats high blood pressure.&lt;/p&gt;</summary></entry></feed>`);
    expect(x?.url).toMatch(/a692051/); expect(x?.text).toMatch(/high blood pressure/);
    expect(parseConnect("<feed></feed>")).toBeNull();
    // Real drug responses carry a title and link but no summary
    const real = parseConnect(JSON.stringify({ feed: { entry: [{ title: { _value: "Lisinopril: MedlinePlus Drug Information" }, link: [{ href: "https://medlineplus.gov/druginfo/meds/a692051.html" }] }] } }));
    expect(real).toMatchObject({ url: "https://medlineplus.gov/druginfo/meds/a692051.html", text: "" });
  });
  it("searches papers by ingredient, not salt", () => { expect(stripSalt("METFORMIN HYDROCHLORIDE")).toBe("metformin"); });
});

import { extractOdsSections } from "../server/sources/ods.js";
describe("ODS API output", () => {
  it("uses the official API URL and extracts question-style headings even without heading tags", async () => {
    await buildEducation("vitamin d");
    expect(calls.some((c) => c.includes("ods.od.nih.gov/api/index.aspx?resourcename=VitaminD&readinglevel=Consumer"))).toBe(true);
    expect(calls.every((c) => !c.includes("connect.medlineplus.gov/application"))).toBe(true);
    const plain = "<p>What is vitamin D and what does it do?</p><p>Vitamin D is a nutrient found in some foods that helps your body absorb calcium and supports bones.</p><p>Can vitamin D be harmful?</p><p>Yes, too much vitamin D can raise calcium levels in the blood and cause nausea and kidney problems.</p>";
    const s = extractOdsSections(plain);
    expect(s.map((x) => x.role)).toEqual(["uses", "warnings"]);
  });
});

describe("when NIH blocks the request", () => {
  it("links the fact sheet instead of inventing content", async () => {
    installMock({ "ods.od.nih.gov": () => new Response("Forbidden", { status: 403 }) });
    const b = await buildEducation("vitamin d");
    const ods = b.sources.find((x) => x.type === "nih_ods")!;
    expect(ods.url).toBe("https://ods.od.nih.gov/factsheets/VitaminD-Consumer/");
    expect(ods.text).toMatch(/could not be loaded/);
    expect(b.notices.join(" ")).toMatch(/linked instead/);
  });
  it("MedlinePlus is linked, never copied", async () => {
    const b = await buildEducation("lisinopril");
    const m = b.sources.find((x) => x.type === "medlineplus")!;
    expect(m.text).toMatch(/links to it instead of copying/);
    expect(m.text).not.toMatch(/high blood pressure/);
  });
});

import { clip, keyPoints, toBullets } from "../server/points";
describe("short key points", () => {
  it("shows short bullets first and keeps the full excerpt on request, each point citing its source", async () => {
    installMock();
    const b = await buildEducation("lisinopril", { kind: "drug" });
    for (const s of b.sections.filter((x) => x.blocks.length)) {
      expect(s.blocks.length).toBeLessThanOrEqual(4);
      for (const bl of s.blocks) { expect(bl.text.length).toBeLessThanOrEqual(260); expect(bl.cites.length).toBeGreaterThan(0); }
    }
    const uses = b.sections.find((s) => s.key === "uses")!;
    expect(uses.blocks[0].text).toMatch(/hypertension/);
    // every key point is a word-for-word piece of its cited passage (except a trailing ellipsis from clipping)
    for (const s of b.sections) for (const bl of s.blocks) {
      if (bl.text.startsWith("Boxed warning:") || bl.text.startsWith("Contraindications:") || s.key === "evidence") continue;
      const src = b.sources.find((x) => x.id === bl.cites[0])!;
      const core = bl.text.replace(/…$/, "");
      if (src.type === "medlineplus") continue;
      expect(src.text.replace(/\s+/g, " ")).toContain(core);
    }
  });
  it("trims over-long sentences at a clause and marks the cut", () => {
    const long = "Lisinopril is indicated for the treatment of hypertension in adult patients and pediatric patients 6 years of age and older to lower blood pressure, and to reduce signs and symptoms of heart failure in patients with several other conditions.";
    const c = clip(long);
    expect(c.length).toBeLessThanOrEqual(211); expect(c.endsWith("…")).toBe(true);
  });
  it("prefers sentences that state the point for each section", () => {
    const pts = keyPoints("Background sentence that says very little at all. The most common adverse reactions are headache, dizziness, cough, and hypotension. Another unrelated filler sentence for length.", "side_effects", 1);
    expect(pts[0]).toMatch(/most common adverse reactions/);
    expect(toBullets("uses", [{ text: "Short one.", cites: ["S1"] }])).toEqual([{ text: "Short one.", cites: ["S1"] }]);
  });
});
