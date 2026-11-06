import { describe, it, expect } from "vitest";
import { dosesForDay, doseState, dosesPerDay } from "../src/core/schedule";
import { supplyStatus } from "../src/core/supply";
import { exportBundle, importBundle } from "../src/core/fhir";
import { scanInteractions } from "../src/core/interactions";
import { sideEffectOverlap } from "../src/core/sideEffects";
import { dayStats, rangeStats } from "../src/core/adherence";
import type { Medication, DoseLog } from "../src/core/types";
import type { EducationBundle } from "../shared/education";

const med = (o: Partial<Medication>): Medication => ({ id: "m1", name: "Lisinopril", kind: "rx", schedule: { kind: "daily", times: ["08:00"] }, startDate: "2026-10-01", createdAt: "", ...o });

describe("schedule", () => {
  it("expands daily, weekday, interval and PRN schedules", () => {
    const meds = [
      med({ id: "a", schedule: { kind: "daily", times: ["20:00", "08:00"] } }),
      med({ id: "b", schedule: { kind: "weekdays", days: [1], times: ["09:00"] } }),       // Mondays
      med({ id: "c", schedule: { kind: "interval", everyDays: 14, times: ["10:00"] } }),
      med({ id: "d", schedule: { kind: "prn" } }),
    ];
    const mon = dosesForDay(meds, "2026-10-12");   // a Monday, 11 days after start
    expect(mon.map((d) => d.medId + d.time)).toEqual(["a08:00", "b09:00", "a20:00"]);
    // Oct 15 is day 14 after the start date, so the every-14-days med (c) is due, between the two daily doses
    expect(dosesForDay(meds, "2026-10-15").map((d) => d.medId + d.time)).toEqual(["a08:00", "c10:00", "a20:00"]);
  });
  it("respects start and end dates", () => {
    const m = med({ endDate: "2026-10-05" });
    expect(dosesForDay([m], "2026-09-30")).toHaveLength(0);
    expect(dosesForDay([m], "2026-10-06")).toHaveLength(0);
    expect(dosesForDay([m], "2026-10-05")).toHaveLength(1);
  });
  it("classifies dose state by time and logs", () => {
    const [d] = dosesForDay([med({})], "2026-10-20");
    const at = (h: number, m = 0) => new Date(2026, 9, 20, h, m);
    expect(doseState(d, new Map(), at(7))).toBe("upcoming");
    expect(doseState(d, new Map(), at(8, 30))).toBe("due");
    expect(doseState(d, new Map(), at(12))).toBe("missed");
    const log: DoseLog = { id: d.key, medId: "m1", date: d.date, time: d.time, status: "taken", at: "" };
    expect(doseState(d, new Map([[d.key, log]]), at(12))).toBe("taken");
  });
});

describe("supply", () => {
  it("estimates days left and flags refill and expiry", () => {
    const m = med({ schedule: { kind: "daily", times: ["08:00", "20:00"] }, supply: { onHand: 10, perDose: 1, expires: "2026-11-05" } });
    const s = supplyStatus(m, "2026-10-23");
    expect(dosesPerDay(m)).toBe(2);
    expect(s.daysLeft).toBe(5);
    expect(s.level).toBe("soon");
    expect(s.expiry).toBe("soon");
    expect(supplyStatus(med({ schedule: { kind: "prn" }, supply: { onHand: 5 } }), "2026-10-23").level).toBe("unknown");
  });
});

describe("FHIR", () => {
  it("exports MedicationStatement and MedicationAdministration", () => {
    const m = med({ rxcui: "314076", indication: "High blood pressure", strength: "10 mg" });
    const log: DoseLog = { id: "m1|2026-10-20|08:00", medId: "m1", date: "2026-10-20", time: "08:00", status: "taken", at: "2026-10-20T12:01:00Z" };
    const b = exportBundle([m], [log]);
    const types = b.entry.map((e: any) => e.resource.resourceType);
    expect(types).toEqual(["MedicationStatement", "MedicationAdministration"]);
    const ms: any = b.entry[0].resource;
    expect(ms.medicationCodeableConcept.coding[0]).toMatchObject({ system: "http://www.nlm.nih.gov/research/umls/rxnorm", code: "314076" });
    expect(ms.reasonCode[0].text).toBe("High blood pressure");
    expect(ms.dosage[0].timing.repeat.timeOfDay).toEqual(["08:00:00"]);
  });
  it("imports an Epic-style bundle (reference, contained, PRN, stopped)", () => {
    const bundle = { resourceType: "Bundle", entry: [
      { resource: { resourceType: "MedicationRequest", id: "1", status: "active", authoredOn: "2026-02-03T00:00:00Z", medicationCodeableConcept: { text: "lisinopril 10 mg tablet", coding: [{ system: "http://www.nlm.nih.gov/research/umls/rxnorm", code: "314076" }] }, requester: { display: "Dr. Lopez" }, reasonCode: [{ text: "Hypertension" }], dispenseRequest: { numberOfRepeatsAllowed: 3 }, dosageInstruction: [{ text: "10 mg by mouth twice daily", timing: { repeat: { frequency: 2, period: 1, periodUnit: "d" } } }] } },
      { resource: { resourceType: "MedicationRequest", id: "2", status: "active", medicationReference: { reference: "#med1" }, contained: [{ resourceType: "Medication", id: "med1", code: { coding: [{ display: "metformin 500 mg tablet" }] } }], dosageInstruction: [{ asNeededBoolean: true }] } },
      { resource: { resourceType: "MedicationRequest", id: "3", status: "stopped", medicationCodeableConcept: { text: "amoxicillin" } } },
      { resource: { resourceType: "Patient", id: "p" } },
    ] };
    const meds = importBundle(bundle, "2026-10-23");
    expect(meds.map((m) => m.name)).toEqual(["lisinopril 10 mg tablet", "metformin 500 mg tablet", "amoxicillin"]);
    expect(meds[0]).toMatchObject({ rxcui: "314076", indication: "Hypertension", startDate: "2026-02-03", supply: { refillsLeft: 3 }, prescriber: { name: "Dr. Lopez" } });
    expect(meds[0].schedule).toEqual({ kind: "daily", times: ["08:00", "20:00"] });
    expect(meds[1].schedule.kind).toBe("prn");
    expect(meds[2].archived).toBe(true);
  });
});

const bundleWith = (name: string, interactions: string, adverse: string): { key: string; bundle: EducationBundle } => ({
  key: `drug:${name}`,
  bundle: { query: name, kind: "drug", genericNames: [name.toUpperCase()], brandNames: [], fetchedAt: "", mode: "extractive", notices: [],
    sources: [{ id: "S1", type: "fda_label", org: "FDA", title: "t", url: "u", retrievedAt: "", text: interactions, section: "Drug interactions" }, { id: "S2", type: "fda_label", org: "FDA", title: "t", url: "u", retrievedAt: "", text: adverse, section: "Adverse reactions" }],
    sections: [{ key: "interactions", title: "", blocks: [{ text: "", cites: ["S1"] }] }, { key: "side_effects", title: "", blocks: [{ text: "", cites: ["S2"] }] }] },
});

describe("interaction flags", () => {
  it("finds another medicine named (or classed) in a label's interaction text", () => {
    const a = med({ id: "a", name: "Lisinopril" });
    const b = med({ id: "b", name: "Ibuprofen" });
    const c = med({ id: "c", name: "Vitamin D", kind: "supplement" });
    const bundles = new Map([["a", bundleWith("lisinopril", "NSAIDs may reduce the antihypertensive effect. Lithium levels may increase.", "Headache is common.")]]);
    const flags = scanInteractions([a, b, c], bundles);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ a: "a", b: "b", term: "nsaid", sourceId: "S1" });
    expect(flags[0].sentence).toMatch(/NSAIDs may reduce/);
  });
});

describe("only verified, unwanted interactions are flagged", () => {
  const a = med({ id: "a", name: "Lisinopril" });
  const ibu = med({ id: "b", name: "Ibuprofen" });
  const ca = med({ id: "c", name: "Calcium", kind: "supplement" });
  it("ignores mentions in general warnings (not the Drug Interactions text)", () => {
    const b = bundleWith("lisinopril", "Nothing relevant here.", "x");
    b.bundle.sources.push({ id: "S3", type: "fda_label", org: "FDA", title: "t", url: "u", retrievedAt: "", text: "Use caution in patients who take NSAIDs such as ibuprofen.", section: "Warnings and precautions" });
    expect(scanInteractions([a, ibu], new Map([["a", b]]))).toHaveLength(0);
  });
  it("ignores sentences that say there is no effect", () => {
    const b = bundleWith("lisinopril", "No clinically significant interaction was seen with ibuprofen. Ibuprofen did not alter lisinopril levels.", "x");
    expect(scanInteractions([a, ibu], new Map([["a", b]]))).toHaveLength(0);
  });
  it("does not treat calcium channel blockers as calcium", () => {
    const b = bundleWith("lisinopril", "Calcium channel blockers may increase the risk of hypotension.", "x");
    expect(scanInteractions([a, ca], new Map([["a", b]]))).toHaveLength(0);
  });
  it("marks avoid / contraindicated language as strong", () => {
    const b = bundleWith("lisinopril", "Avoid concomitant use with NSAIDs because of increased risk of renal injury. NSAIDs may reduce the effect.", "x");
    const f = scanInteractions([a, ibu], new Map([["a", b]]));
    expect(f).toHaveLength(1);
    expect(f[0].strong).toBe(true);
  });
});

describe("side-effect overlap", () => {
  it("links logged symptoms to labelled adverse reactions", () => {
    const a = med({ id: "a" });
    const bundles = new Map([["a", bundleWith("lisinopril", "x", "The most common adverse reactions are headache, dizziness and cough.")]]);
    const flags = sideEffectOverlap([a], [{ id: "1", date: "2026-10-20", symptoms: ["Dizzy"] }, { id: "2", date: "2026-10-21", symptoms: ["dizziness"] }], bundles, "2026-10-01");
    expect(flags).toHaveLength(1);
    expect(flags[0].dates).toEqual(["2026-10-21"]);
  });
});

describe("adherence", () => {
  it("counts taken, skipped and missed doses", () => {
    const m = med({ schedule: { kind: "daily", times: ["08:00", "20:00"] } });
    const logs: DoseLog[] = [{ id: "m1|2026-10-20|08:00", medId: "m1", date: "2026-10-20", time: "08:00", status: "taken", at: "" }];
    const now = new Date(2026, 9, 21, 12, 0);
    expect(dayStats([m], logs, "2026-10-20", now)).toMatchObject({ scheduled: 2, taken: 1, missed: 1 });
    expect(rangeStats([m], logs, "2026-10-20", 1, now).pct).toBe(50);
  });
});

describe("regressions", () => {
  it("as-needed doses never offset missed scheduled doses", () => {
    const m = med({ id: "m1", schedule: { kind: "daily", times: ["08:00", "20:00"] } });
    const prn = med({ id: "p1", name: "Ibuprofen", schedule: { kind: "prn" } });
    const logs: DoseLog[] = [{ id: "p1|2026-10-20|prn-1", medId: "p1", date: "2026-10-20", time: "prn-1", status: "taken", at: "" }];
    const r = rangeStats([m, prn], logs, "2026-10-20", 1, new Date(2026, 9, 21, 12));
    expect(r.taken).toBe(0);
    expect(r.pct).toBe(0);
  });
  it("does not flag two entries for the same ingredient as an interaction, and prefers the interactions section", () => {
    const a = med({ id: "a", name: "Lisinopril" });
    const dup = med({ id: "d", name: "Zestril" });
    const nsaid = med({ id: "n", name: "Advil" });
    const b = bundleWith("lisinopril", "NSAIDs may reduce the antihypertensive effect.", "x");
    b.bundle.brandNames = ["Zestril"];
    b.bundle.sources.push({ id: "S3", type: "fda_label", org: "FDA", title: "t", url: "u", retrievedAt: "", text: "Discontinue lisinopril in pregnancy. Advil is not mentioned here." });
    b.bundle.sections.push({ key: "warnings", title: "", blocks: [{ text: "", cites: ["S3"] }] });
    const flags = scanInteractions([a, dup, nsaid], new Map([["a", b]]));
    expect(flags.map((f) => f.b)).toEqual(["n"]);     // Zestril is lisinopril itself
    expect(flags[0].sourceId).toBe("S1");              // from the interactions passage
  });
});

import { planReminders } from "../src/core/notify";
describe("phone reminders plan", () => {
  it("lists upcoming doses only, skips logged ones and stopped medicines, and respects the limit", () => {
    const m = med({ id: "m1", name: "Lisinopril", strength: "10 mg", startDate: "2026-10-01", schedule: { kind: "daily", times: ["08:00", "20:00"] } });
    const stopped = med({ id: "m2", archived: true, schedule: { kind: "daily", times: ["09:00"] } });
    const now = new Date(2026, 9, 21, 12, 0);
    const taken = new Map([["m1|2026-10-21|20:00", { id: "m1|2026-10-21|20:00", medId: "m1", date: "2026-10-21", time: "20:00", status: "taken" as const, at: "" }]]);
    const plan = planReminders([m, stopped], taken, now, 2);
    expect(plan.map((p) => `${p.at.getMonth() + 1}/${p.at.getDate()} ${p.at.getHours()}:00`)).toEqual(["10/22 8:00", "10/22 20:00", "10/23 8:00", "10/23 20:00"]);
    expect(plan[0]).toMatchObject({ title: "Time for Lisinopril", body: "10 mg scheduled for 08:00" });
    expect(new Set(plan.map((p) => p.id)).size).toBe(plan.length);
    expect(planReminders([m], new Map(), now, 30, 5)).toHaveLength(5);
  });
});
