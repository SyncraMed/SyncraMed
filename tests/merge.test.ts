import { describe, expect, it } from "vitest";
import { mergeReads } from "../src/scan/merge";
import { parseLabel } from "../src/scan/parse";

describe("combining several readings of one label", () => {
  const a = "PHARMACY CVS\nSERTRALINE 50 MG TABLET\nTAKE 1 TABLET BY MOUTH\nQTY: 30 REFILLS REMAINING: 4\nPRESCRIBER: DR. EMILY";
  const b = "SERTRALINE 50 MG TABLET\nTAKE 1 TABLET BY MOUTH DAILY\nPRESCRIBER: DR. EMILY GARCIA";
  it("fills each field from whichever reading found it", () => {
    const r = mergeReads([a, b]);
    expect(r.nameCandidates[0]).toMatch(/sertraline/i); expect(r.strength).toBe("50 mg");
    expect(r.quantity).toBe(30); expect(r.refills).toBe(4);
    expect(r.prescriber).toBe("Dr. Emily Garcia"); expect(r.directions).toMatch(/daily/i); expect(r.schedule?.kind).toBe("daily");
  });
});

describe("OCR slips on a label", () => {
  it("'Dr. License 998877' is not a prescriber", () => { expect(parseLabel("Rx 123 FILLED 10/01/2026 Dr. License 998877\nPRESCRIBER: DR. LINDA NGUYEN").prescriber).toBe("Dr. Linda Nguyen"); });
  it("TAKE1 and 0TY are repaired", () => { const r = parseLabel("LISINOPRIL 10 MG TABLET\nTAKE1 TABLET BY MOUTH DAILY\n0TY:30 REFILLS: 2"); expect(r.quantity).toBe(30); expect(r.perDose).toBe(1); });
  it("directions without the word TAKE are still found", () => { expect(parseLabel("REFILLS: 3\nATORVASTATIN 20 MG TABLET\nTABLET BY MOUTH AT BEDTIME\nQTY: 90").directions).toMatch(/bedtime/i); });
  it("a number just before REFILLS is the quantity when QTY was missed", () => { expect(parseLabel("AMLODIPINE 5 MG TABLET\n30 REFILLS: 0").quantity).toBe(30); });
  it("O'Brien with a zero for the O", () => { expect(parseLabel("PRESCRIBER: DR. JAMES 0'BRIEN").prescriber).toBe("Dr. James O'Brien"); });
});
