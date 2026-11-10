import { describe, expect, it } from "vitest";
import { estimateSkew, flatten, localThreshold, rotate, sharpness, type Gray } from "../src/scan/flatten";

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
    const { page: p } = flatten(page(500, 300, true), 800);
    expect([...new Set(p.data)].sort()).toEqual([0, 255]);
  });
});
