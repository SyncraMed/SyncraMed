import { describe, it, expect, beforeEach } from "vitest";
import { installMock, calls } from "./fixtures/mock.js";
import { answerQuestion, detectTopics } from "../server/ask.js";
import { assertFetchable } from "../server/trusted.js";
import { parseHealthTopics } from "../server/sources/healthtopics.js";

beforeEach(() => installMock());
const good = async (_s: string, u: string) => { const blk = u.split("\n\n").find((x) => /headache|dizziness/.test(x)); const id = /^\[(S\d+)\]/.exec(blk ?? "")?.[1] ?? "S1"; return JSON.stringify({ covered: true, answer: [{ text: "The most common reactions are headache, dizziness, cough and hypotension.", cites: [id] }] }); };

describe("topic detection", () => {
  it("finds names, misspellings, supplements and the person's own list", () => {
    expect(detectTopics("what are the side effects of lisinopril?")).toEqual(["lisinopril"]);
    expect(detectTopics("does metoprolol cause dizzyness")).toEqual(["metoprolol"]);
    expect(detectTopics("can lisinopril and vitamin D be taken together")[0]).toBe("lisinopril");
    expect(detectTopics("does this interact with my other meds?", ["Metformin", "Aspirin"])).toEqual(["Metformin", "Aspirin"]);
    expect(detectTopics("what about side effects?", [], ["lisinopril"])).toEqual(["lisinopril"]);
  });
});

describe("ask: always from retrieved, verified sources", () => {
  it("returns a checked AI answer with citations and the educational disclaimer", async () => {
    const r = await answerQuestion("What are the common side effects of lisinopril?", { llm: good });
    expect(r.mode).toBe("ai"); expect(r.answer.length).toBeGreaterThan(0);
    const ids = new Set(r.sources.map((s) => s.id));
    for (const b of r.answer) { expect(b.cites.length).toBeGreaterThan(0); for (const c of b.cites) expect(ids.has(c)).toBe(true); }
    expect(r.disclaimer).toMatch(/education/i);
    for (const c of calls) expect(() => assertFetchable(c)).not.toThrow();
  });
  it("throws out invented numbers and falls back to verbatim source sentences", async () => {
    const bad = async () => JSON.stringify({ covered: true, answer: [{ text: "Side effects occur in 87% of patients and include seizures.", cites: ["S1"] }] });
    const r = await answerQuestion("What are the side effects of lisinopril?", { llm: bad });
    expect(r.mode).toBe("excerpt"); expect(r.notices.join(" ")).toMatch(/discarded/);
    for (const b of r.answer) expect(r.sources.find((s) => s.id === b.cites[0])!.text).toContain(b.text.slice(0, 30));
  });
  it("uses verbatim sentences if the AI service is down", async () => {
    const r = await answerQuestion("What are the side effects of lisinopril?", { llm: async () => { throw new Error("503"); } });
    expect(r.mode).toBe("excerpt"); expect(r.answer.length).toBeGreaterThan(0);
  });
  it("says so, and does not answer, when the model reports the sources do not cover it", async () => {
    const r = await answerQuestion("What are the side effects of lisinopril?", { llm: async () => JSON.stringify({ covered: false, answer: [] }) });
    expect(r.mode).toBe("none"); expect(r.answer).toEqual([]); expect(r.sources.length).toBeGreaterThan(0);
  });
  it("does not answer an unrelated question just because a drug name is in it", async () => {
    const r = await answerQuestion("lisinopril and the capital of France", { llm: good });
    expect(r.mode).toBe("none"); expect(r.answer).toEqual([]);
  });
  it("finds nothing for a question with no medicine and no health-topic match", async () => {
    const r = await answerQuestion("who won the football game", { llm: good });
    expect(r.mode).toBe("none"); expect(r.notices.join(" ")).toMatch(/not answer from the AI|does not answer from/i);
  });
  it("sends emergencies to emergency help and retrieves nothing", async () => {
    const r = await answerQuestion("I took too much lisinopril, overdose", { llm: good });
    expect(r.category).toBe("emergency"); expect(r.banner).toMatch(/911/); expect(r.answer).toEqual([]); expect(calls.length).toBe(0);
  });
  it("adds a doctor-or-pharmacist banner for personal-decision questions", async () => {
    const r = await answerQuestion("Should I stop taking lisinopril?", { llm: good });
    expect(r.category).toBe("actionable"); expect(r.banner).toMatch(/doctor or pharmacist/);
  });
});

describe("MedlinePlus health topics parser", () => {
  it("reads title, link and summary, and ignores other hosts", () => {
    const xml = `<nlmSearchResult><list num="2"><document url="https://medlineplus.gov/highbloodpressure.html" rank="0"><content name="title">&lt;span class="qt0"&gt;High&lt;/span&gt; Blood Pressure</content><content name="FullSummary">&lt;p&gt;High blood pressure means the force of blood against artery walls is too high.&lt;/p&gt;</content></document><document url="https://evil.example/x" rank="1"><content name="title">x</content><content name="FullSummary">y</content></document></list></nlmSearchResult>`;
    const t = parseHealthTopics(xml);
    expect(t).toHaveLength(1); expect(t[0].title).toBe("High Blood Pressure"); expect(t[0].text).toMatch(/artery walls/);
  });
});
