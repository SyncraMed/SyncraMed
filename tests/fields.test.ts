import { describe, expect, it } from "vitest";
import { parseLabel } from "../src/scan/parse";
import { cleanDirections, cleanPrescriber, fixName, findQuantity, findRefills } from "../src/scan/fields";

const L = (s: string) => s.split("\n");

describe("quantity and refills, in the many ways labels print them", () => {
  const cases: [string, number | undefined, number | undefined][] = [
    ["QTY: 30\nREFILLS: 2", 30, 2],
    ["Qty 90 Refills 0", 90, 0],
    ["QUANTITY: 60 REFILLS REMAINING: 3", 60, 3],
    ["Quantity\n30\nRefills\n3", 30, 3],
    ["3 REFILLS REMAINING\nQTY 30", 30, 3],
    ["QTY 30\nNO REFILLS", 30, 0],
    ["REFILLS BEFORE 12/22/2026: 5\nQTY: 30", 30, 5],
    ["Oty: 30 Refilis: 2", 30, 2],
    ["QTY:30 REFILLS:3", 30, 3],
    ["REFILL(S) LEFT: 4  QTY 28 DAY SUPPLY 28", 28, 4],
    ["Qty. 120 mL RF: 1", 120, 1],
    ["DISP #30 REFILLS: NONE", 30, 0],
    ["RX# 7654321 QTY 30 REFILLS 1", 30, 1],
    ["FILLED: 10/01/2026 QTY: 30 DISCARD AFTER 10/30/2027 REFILLS: 2", 30, 2],
    ["Refills Remaining: Zero\nQuantity: 14", 14, 0],
    ["QTY: 3O REFILLS: 1", 30, 1],
    ["Refills: 11 Qty: 100 tablets", 100, 11],
    ["REFILLS LEFT 2\nQTY 60 TABLETS", 60, 2],
    ["QTY REFILLS\n30 2", 30, 2], // headings over numbers: matched in order
    ["QTY REF1LLS: 4 Quantlty: 45", 45, 4],
    ["No refills remaining. Qty: 20", 20, 0],
  ];
  for (const [text, q, r] of cases) it(JSON.stringify(text), () => { const p = parseLabel(text); expect(p.quantity).toBe(q); expect(p.refills).toBe(r); });
  it("an Rx number or a phone number is never the quantity", () => { expect(findQuantity(L("RX# 7654321\nCALL (239) 555-0142 FOR REFILLS"))).toBeUndefined(); expect(findRefills(L("CALL (239) 555-0142 FOR REFILLS"))).toBeUndefined(); });
});

describe("directions keep only instruction words", () => {
  const cases: [string, string | undefined][] = [
    ["TAKE 1 TABLET BY MOUTH ONCE DAILY xQ7 Iz ee QTY 30", "TAKE 1 TABLET BY MOUTH ONCE DAILY"],
    ["TAKE 1 TABLET BY MOUTH DAILY FOR HYPERTENSION", "TAKE 1 TABLET BY MOUTH DAILY FOR HYPERTENSION"],
    ["TAKE ONE CAPSULE BY MOUTH EVERY 8 HOURS AS NEEDED FOR PAIN DISCARD AFTER 10/30/2027", "TAKE ONE CAPSULE BY MOUTH EVERY 8 HOURS AS NEEDED FOR PAIN"],
    ["| TAKE 1 TABLET BY MOUTH TWICE DAILY WITH MEALS a_ . ~", "TAKE 1 TABLET BY MOUTH TWICE DAILY WITH MEALS"],
    ["ee Ix TAKE 1 TABLET BY MOUTH AT BEDTIME PHARMACY", "TAKE 1 TABLET BY MOUTH AT BEDTIME"],
    ["APPLY THIN LAYER TO AFFECTED AREA TWICE DAILY", "APPLY THIN LAYER TO AFFECTED AREA TWICE DAILY"],
    ["xqzt brrr", undefined],
    ["TAKE 1 TABLET BY MOUTH ONCE DAILY AND", "TAKE 1 TABLET BY MOUTH ONCE DAILY"],
  ];
  for (const [raw, want] of cases) it(raw, () => { expect(cleanDirections(raw)).toBe(want); });
});

describe("prescriber and medicine name keep only what belongs", () => {
  it("prescriber", () => {
    expect(cleanPrescriber("DR. SARAH PATEL RPH 4")).toBe("SARAH PATEL");
    expect(cleanPrescriber("J SMITH MD")).toBe("J SMITH");
    expect(cleanPrescriber("PATEL xQz 77")).toBe("PATEL");
    expect(cleanPrescriber("12 34")).toBeUndefined();
  });
  it("names are repaired from the common-medicine list", () => {
    expect(fixName("JSINOPRIL")).toEqual({ name: "Lisinopril", known: true });
    expect(fixName("ATORVASTATIN CALCIUM")?.name).toBe("Atorvastatin");
    expect(fixName("Lisinoprll")?.name).toBe("Lisinopril");
    expect(fixName("TABLET RX GENERIC")).toBeUndefined();
    expect(fixName("zzxqk")).toBeUndefined();
  });
  it("a full label comes out with no filler", () => {
    const p = parseLabel("CVS pharmacy\nJANE DOE\nJSINOPRIL 10 MG TABLET\nTAKE 1 TABLET BY MOUTH ONCE DAILY xQ7 ee\nQty 30 Refilis: 2\nPRESCRIBER: DR. SARAH PATEL RPH 4");
    expect(p.nameCandidates[0]).toBe("Lisinopril"); expect(p.strength).toBe("10 mg");
    expect(p.directions).toBe("Take 1 tablet by mouth once daily"); expect(p.quantity).toBe(30); expect(p.refills).toBe(2); expect(p.prescriber).toBe("Dr. Sarah Patel");
  });
});

import { findQuantity as fq2, findRefills as fr2, cleanDirections as cd2 } from "../src/scan/fields";
describe("stacked headings and leaks", () => {
  it("heading lines then numbers", () => {
    const L = ["QUANTITY", "REFILLS REMAINING", "60 5"];
    expect(fq2(L)).toBe(60); expect(fr2(L)).toBe(5);
    expect(fq2(["QUANTITY", "REFILLS REMAINING", "60"])).toBe(60);
    expect(fq2(["QUANTITY    REFILLS", "30    2"])).toBe(30);
  });
  it("directions trims", () => {
    expect(cd2("TAKE1TABLET BY MOUTH TWICE DAILY WITH MEALS")).toBe("TAKE 1 TABLET BY MOUTH TWICE DAILY WITH MEALS");
    expect(cd2("Take 1 tablet by mouth every morning day")).toBe("Take 1 tablet by mouth every morning");
    expect(cd2("Take 1 tablet by mouth at bedtime 90 3")).toBe("Take 1 tablet by mouth at bedtime");
  });
});
it("quantity glued to a misread QTY", () => { expect(findQuantity(["Qy30 RF:11"])).toBe(30); expect(findRefills(["Qy30 RF:11"])).toBe(11); });
