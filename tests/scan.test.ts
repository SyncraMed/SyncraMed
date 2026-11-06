import { describe, it, expect } from "vitest";
import { parseLabel, parseDirections } from "../src/scan/parse";

const RX1 = `CVS PHARMACY #1234
123 MAIN ST FORT MYERS FL 33901
(239) 555-0100
RX 1234567-01234 DR. MARIA LOPEZ
JANE DOE
123 OAK LN
LISINOPRIL 10 MG TABLET
TAKE 1 TABLET BY MOUTH TWICE DAILY
QTY: 60  REFILLS: 3
FILLED: 10/01/2026
DISCARD AFTER: 10/30/2027`;

describe("prescription label", () => {
  const r = parseLabel(RX1);
  it("reads medicine, strength, form, kind", () => {
    expect(r.kind).toBe("rx");
    expect(r.nameCandidates[0]).toBe("Lisinopril");
    expect(r.strength).toBe("10 mg");
    expect(r.form).toBe("tablet");
  });
  it("turns directions into a schedule", () => {
    expect(r.directions).toBe("Take 1 tablet by mouth twice daily");
    expect(r.schedule).toEqual({ kind: "daily", times: ["08:00", "20:00"] });
    expect(r.perDose).toBe(1);
  });
  it("reads supply, refills, dates, prescriber and pharmacy", () => {
    expect(r.quantity).toBe(60);
    expect(r.refills).toBe(3);
    expect(r.filled).toBe("2026-10-01");
    expect(r.expires).toBe("2027-10-30");
    expect(r.prescriber).toBe("Dr. Maria Lopez");
    expect(r.pharmacy).toEqual({ name: "Cvs Pharmacy", phone: "(239) 555-0100" });
  });
  it("never reads the patient's name or address", () => {
    expect(JSON.stringify(r)).not.toMatch(/jane|doe|oak/i);
  });
});

describe("OCR noise and layouts", () => {
  it("handles mixed case, noise characters and a wrapped directions line", () => {
    const r = parseLabel(`Walgreens Pharmacy
Rx# 998877
Metformin HCl 500mg Tablets
Take 1 tablet by mouth |
with meals twice a day
Qty 120 Refills 5
Dr. Smith`);
    expect(r.nameCandidates[0]).toMatch(/Metformin/);
    expect(r.strength).toBe("500 mg");
    expect(r.schedule).toEqual({ kind: "daily", times: ["08:00", "20:00"] });
    expect(r.quantity).toBe(120);
    expect(r.refills).toBe(5);
    expect(r.prescriber).toBe("Dr. Smith");
  });
  it("reads liquids and weekly injections", () => {
    const l = parseLabel(`RX 5551212\nAMOXICILLIN 250 MG/5 ML SUSPENSION\nTAKE 5 ML BY MOUTH EVERY 8 HOURS\nQTY: 150 ML REFILLS: 0`);
    expect(l.strength).toMatch(/250 mg/);
    expect(l.schedule).toEqual({ kind: "daily", times: ["08:00", "14:00", "20:00"] });
    expect(l.refills).toBe(0);
    const w = parseLabel(`SEMAGLUTIDE 1 MG/0.5 ML PEN\nINJECT 1 MG UNDER THE SKIN ONCE A WEEK\nREFILLS: 2`);
    expect(w.schedule).toEqual({ kind: "interval", everyDays: 7, times: ["08:00"] });
  });
  it("detects as-needed medicines", () => {
    const r = parseLabel(`ONDANSETRON 4 MG TABLET\nTAKE 1 TABLET BY MOUTH EVERY 8 HOURS AS NEEDED FOR NAUSEA\nREFILLS: 1`);
    expect(r.schedule).toEqual({ kind: "prn" });
  });
  it("warns instead of guessing when it can't read things", () => {
    const r = parseLabel(`~~~ \n  \n12345`);
    expect(r.nameCandidates).toHaveLength(0);
    expect(r.warnings.join(" ")).toMatch(/couldn't find a medicine name/);
  });
});

describe("over-the-counter and supplements", () => {
  it("reads an OTC Drug Facts panel", () => {
    const r = parseLabel(`ADVIL\nIbuprofen Tablets, 200 mg\nPain reliever / Fever reducer\nDrug Facts\nActive ingredient (in each tablet) Ibuprofen 200 mg\nPurpose Pain reliever/fever reducer`);
    expect(r.kind).toBe("otc");
    expect(r.nameCandidates).toEqual(expect.arrayContaining(["Ibuprofen"]));
    expect(r.nameCandidates).toContain("Advil");
    expect(r.strength).toBe("200 mg");
    expect(r.refills).toBeUndefined();
  });
  it("recognizes a supplement and its expiry month", () => {
    const r = parseLabel(`Nature Made\nVitamin D3 25 mcg (1000 IU)\nSupplement Facts\nDietary supplement 100 softgels\nEXP 06/2027`);
    expect(r.kind).toBe("supplement");
    expect(r.nameCandidates.join(" ")).toMatch(/Vitamin D/i);
    expect(r.expires).toBe("2027-06-30");
  });
});

describe("directions", () => {
  it("covers common sig phrases", () => {
    expect(parseDirections("Take one capsule at bedtime").schedule).toEqual({ kind: "daily", times: ["21:00"] });
    expect(parseDirections("Take 2 tablets three times daily").perDose).toBe(2);
    expect(parseDirections("Take 1/2 tablet daily").perDose).toBe(0.5);
    expect(parseDirections("Apply to affected area four times a day").schedule).toEqual({ kind: "daily", times: ["08:00", "12:00", "16:00", "20:00"] });
    expect(parseDirections("Take every 12 hours").schedule).toEqual({ kind: "daily", times: ["08:00", "20:00"] });
    expect(parseDirections("Use as directed").schedule).toBeUndefined();
  });
});

import { beforeEach } from "vitest";
import { resolveCandidates, lookupCode, ndcVariants } from "../server/scan";
import { installMock, calls, LISINOPRIL_LABEL } from "./fixtures/mock";

describe("server helpers", () => {
  beforeEach(() => installMock());
  it("matches OCR names to real drugs and drops junk", async () => {
    const m = await resolveCandidates(["Lisinopril"]);
    expect(m[0]).toMatchObject({ name: "lisinopril", rxcui: "314076" });
    installMock({ approximateTerm: () => new Response(JSON.stringify({ approximateGroup: { candidate: [{ rxcui: "314076", score: "20" }] } })) });
    expect(await resolveCandidates(["Xqzvbn Pharm"])).toEqual([]);
  });
  it("builds NDC spellings from a barcode", () => {
    expect(ndcVariants("00378180501")).toEqual(expect.arrayContaining(["00378-1805-01", "0378-1805-01", "00378-1805-1"]));
    expect(ndcVariants("300378180501")).toEqual(expect.arrayContaining(["0378-1805-01"]));
  });
  it("finds a drug by barcode on openFDA only", async () => {
    const hit = await lookupCode("300378180501");
    expect(hit?.name).toBe("Lisinopril");
    expect(calls.every((u) => u.startsWith("https://api.fda.gov/"))).toBe(true);
    expect(await lookupCode("123")).toBeNull();
  });
});

import { ScanAccumulator } from "../src/scan/live";
import { essentials, fixDigits } from "../src/scan/parse";
describe("live scan accumulator", () => {
  const good = "LISINOPRIL 10 MG TABLET\nTAKE 1 TABLET BY MOUTH TWICE DAILY\nQTY: 60 REFILLS: 3\nDR. MARIA LOPEZ";
  it("waits for a name that matches a real medicine, ignoring one bad frame", () => {
    const a = new ScanAccumulator();
    a.add("LISINQPRIL 1O MG\nTAKE 1 TAB");
    a.add(good); a.add(good);
    expect(a.ready()).toBe(false);                       // name not yet confirmed as a real medicine
    a.needsChecking().forEach((n) => a.setChecked(n, "lisinopril"));
    expect(a.ready()).toBe(true);
    const r = a.result();
    expect(r.nameCandidates[0]).toBe("Lisinopril");
    expect(r.strength).toBe("10 mg"); expect(r.quantity).toBe(60); expect(r.refills).toBe(3); expect(r.prescriber).toBe("Dr. Maria Lopez");
  });
  it("turns a partial word into the full medicine name once matched", () => {
    const a = new ScanAccumulator();
    a.add("LISINOP 10 MG TABLET\nTAKE 1 TABLET DAILY"); a.add("LISINOP 10 MG TABLET\nTAKE 1 TABLET DAILY");
    expect(a.needsChecking()).toEqual(["Lisinop"]);
    a.setChecked("Lisinop", "lisinopril");
    expect(a.topNames()[0].name).toBe("Lisinopril");
    expect(a.ready()).toBe(true);
  });
  it("drops junk that isn't a medicine", () => {
    const a = new ScanAccumulator();
    a.add("SMITHFIELD 5 MG TABLET"); a.add("SMITHFIELD 5 MG TABLET");
    a.needsChecking().forEach((n) => a.setChecked(n, null));
    expect(a.topNames()).toEqual([]); expect(a.ready()).toBe(false);
  });
  it("reports only the five wanted details", () => {
    const a = new ScanAccumulator(); a.offline = true;
    const t = "CVS PHARMACY #1234\n(239) 555-0100\nRX 1234567-01234 DR. MARIA LOPEZ\nJANE DOE\nLISINOPRIL 10 MG TABLET\nTAKE 1 TABLET BY MOUTH TWICE DAILY\nQTY: 60 REFILLS: 3\nFILLED: 10/01/2026\nDISCARD AFTER: 10/30/2027";
    a.add(t); a.add(t);
    expect(a.summary().map((x) => x.label)).toEqual(["Medicine", "Directions", "Quantity", "Refills", "Prescriber"]);
    const r = a.result();
    expect(r.pharmacy).toBeUndefined(); expect(r.expires).toBeUndefined(); expect(r.filled).toBeUndefined();
    expect(JSON.stringify(r)).not.toMatch(/jane|doe|cvs|1234567/i);
    expect(a.complete()).toBe(true);
  });
  it("trusts a barcode match as a real medicine", () => {
    const a = new ScanAccumulator(); a.add("", "Ibuprofen"); a.add("JANE DOE\nRX 5551234");
    expect(a.topNames()[0].name).toBe("Ibuprofen");
    expect(JSON.stringify(a.result())).not.toMatch(/jane|doe/i);
  });
});

describe("OCR repair", () => {
  it("fixes letters misread as digits next to units and counts", () => {
    expect(fixDigits("LISINOPRIL 1O MG\nQTY: 6O REFILLS: O")).toBe("LISINOPRIL 10 MG\nQTY: 60 REFILLS: 0");
    expect(fixDigits("METFORMIN 5OO mg")).toBe("METFORMIN 500 mg");
    expect(fixDigits("Take one tablet")).toBe("Take one tablet");           // words are left alone
    expect(fixDigits("OMEGA mg")).toBe("OMEGA mg");
  });
  it("essentials() keeps only medicine, strength, directions, quantity, refills and prescriber", () => {
    const e = essentials(parseLabel("CVS PHARMACY\n(239) 555-0100\nLISINOPRIL 10 MG TABLET\nTAKE 1 TABLET DAILY\nQTY: 30 REFILLS: 2\nDR. SMITH\nEXP 06/2027"));
    expect(e.pharmacy).toBeUndefined(); expect(e.expires).toBeUndefined();
    expect(e).toMatchObject({ strength: "10 mg", quantity: 30, refills: 2, prescriber: "Dr. Smith" });
  });
});
