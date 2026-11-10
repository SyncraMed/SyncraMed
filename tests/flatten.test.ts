import { describe, expect, it } from "vitest";
import { estimateSkew, flatten, localThreshold, normalize, rotate, sharpness, textBounds, type Gray } from "../src/scan/flatten";

// A page of "text lines": dark bars, optionally on a lighting gradient.
function page(w: number, h: number, shade = false): Gray {
  const data = new Uint8ClampedArray(w * h).fill(235);
  for (let line = 0; line < 9; line++) for (let y = 30 + line * 28; y < 42 + line * 28; y++) for (let x = 30; x < w - 30; x++) if ((x / 6 | 0) % 5 !== 4) data[y * w + x] = 40;
  if (shade) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = data[y * w + x] * (0.35 + 0.65 * (x / w));
  return { data, w, h };
}

describe("flatten", () => {
  it("finds and removes a tilt", () => {
    const tilted = rotate(page(500, 300), -6);
    const found = estimateSkew(tilted);
    expect(Math.abs(found - 6)).toBeLessThan(1.5);
    const fixed = rotate(tilted, found);
    expect(Math.abs(estimateSkew(fixed))).toBeLessThan(1.5);
  });
  it("leaves a straight page alone", () => { expect(estimateSkew(page(500, 300))).toBe(0); });
  it("removes a shadow gradient so text is black and the page is white everywhere", () => {
    const out = localThreshold(page(500, 300, true), 41);
    const px = (x: number, y: number) => out.data[y * 500 + x];
    expect(px(60, 100)).toBe(255); // dark left side of the page, blank area -> white
    expect(px(450, 100)).toBe(255);
    expect(px(40, 35)).toBe(0);    // text on the dark side still black
    expect(px(440, 35)).toBe(0);   // text on the bright side black
  });
  it("sharpness prefers the crisp frame", () => {
    const crisp = page(300, 200); const blur = { ...crisp, data: crisp.data.map((_, i, a) => ((a[i - 1] ?? 0) + a[i] + (a[i + 1] ?? 0) + (a[i - 300] ?? 0) + (a[i + 300] ?? 0)) / 5) as unknown as Uint8ClampedArray };
    expect(sharpness(crisp)).toBeGreaterThan(sharpness(blur));
  });
  it("flatten returns a black-and-white page", () => {
    const f = flatten(page(500, 300, true), 800);
    expect([...new Set(f.hard.data)].sort()).toEqual([0, 255]);
    expect(f.soft.w).toBeGreaterThan(300);
  });
  it("normalize evens the light but keeps grey levels", () => {
    const n = normalize(page(500, 300, true), 61); const px = (x: number, y: number) => n.data[y * 500 + x];
    expect(Math.abs(px(60, 100) - px(450, 100))).toBeLessThan(40); // blank paper equally bright on the dark and bright side
    expect(px(450, 35)).toBeLessThan(px(450, 100) - 60);           // ink is clearly darker
  });
  it("finds the label inside a bigger picture", () => {
    const big: Gray = { data: new Uint8ClampedArray(1000 * 700).fill(120), w: 1000, h: 700 };
    const lab = page(500, 300); for (let y = 0; y < 300; y++) for (let x = 0; x < 500; x++) big.data[(y + 200) * 1000 + x + 250] = lab.data[y * 500 + x];
    const b = textBounds(big);
    expect(b.w).toBeLessThan(800); expect(b.x).toBeLessThan(260); expect(b.x + b.w).toBeGreaterThan(740);
  });
});
