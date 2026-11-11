import { describe, expect, it } from "vitest";
import { fieldsToText } from "../src/scan/ai";
import { mergeReads } from "../src/scan/merge";
import { sanitize } from "../server/labelai";
describe("AI reply -> label text -> fields", () => {
  it("fills every field including the doctor", () => {
    const t = fieldsToText({ medicine: "Lisinopril", strength: "10 mg", form: "tablet", directions: "Take 1 tablet by mouth once daily", quantity: 30, refills: 2, prescriber: "Dr. Sarah Patel", filled: "2026-10-01" });
    const r = mergeReads([t]);
    expect(r.nameCandidates[0].toLowerCase()).toContain("lisinopril"); expect(r.quantity).toBe(30); expect(r.refills).toBe(2);
    expect(r.prescriber).toMatch(/Patel/); expect(r.directions).toBe("Take 1 tablet by mouth once daily");
  });
  it("refills 0 is kept; junk is dropped", () => {
    expect(sanitize({ refills: 0, quantity: 99999, prescriber: "  ", medicine: 5 })).toMatchObject({ refills: 0, quantity: null, prescriber: undefined, medicine: undefined });
  });
});
