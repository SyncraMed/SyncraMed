import { describe, expect, it } from "vitest";
import { stitch, type Rgba } from "../src/scan/stitch";

// A long "label": rows of random-length dark dashes (like text) on paper, so every part looks different.
function longLabel(W: number, H: number): Rgba {
  let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const d = new Uint8ClampedArray(W * H * 4).fill(236); for (let i = 3; i < d.length; i += 4) d[i] = 255;
  for (let row = 0; row < Math.floor(H / 34); row++) { let x = 20; while (x < W - 40) { const len = 10 + Math.floor(rnd() * 70), th = 14 + Math.floor(rnd() * 6);
    for (let y = 12 + row * 34; y < 12 + row * 34 + th; y++) for (let xx = x; xx < Math.min(W, x + len); xx++) { const i = (y * W + xx) * 4; d[i] = d[i + 1] = d[i + 2] = 35; }
    x += len + 10 + Math.floor(rnd() * 24); } }
  return { data: d, w: W, h: H };
}
function window_(src: Rgba, x: number, y: number, w: number, h: number, bright = 1): Rgba {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const s = ((y + j) * src.w + x + i) * 4, o = (j * w + i) * 4; for (let c = 0; c < 3; c++) out[o + c] = src.data[s + c] * bright; out[o + 3] = 255; }
  return { data: out, w, h };
}

describe("stitching a sweep around a long label", () => {
  it("joins overlapping pictures into one long picture", async () => {
    const label = longLabel(2200, 330);
    const xs = [0, 260, 500, 770, 1010, 1260]; const ys = [0, 3, -2, 4, 0, 2]; const bright = [1, 0.95, 1.05, 0.9, 1, 1.02];
    const frames = xs.map((x, i) => window_(label, x, 12 + ys[i], 900, 300, bright[i]));
    const { image, placed } = await stitch(frames.map((f) => f).slice(0, xs.length));
    expect(placed.length).toBeGreaterThanOrEqual(3);
    expect(image.w).toBeGreaterThan(1900); expect(image.w).toBeLessThan(2300);
    // each placement matches where the picture really was, within a few pixels (the first picture is the origin)
    for (const p of placed) expect(Math.abs(p.x - (xs[p.index] - xs[placed[0].index]))).toBeLessThanOrEqual(4);
    // and the joined picture matches the real label where it is covered
    let diff = 0, n = 0; for (let y = 20; y < 280; y += 3) for (let x = 40; x < image.w - 40; x += 3) { diff += Math.abs(image.data[(y * image.w + x) * 4] - label.data[((y + 12 + 1) * label.w + x) * 4]); n++; }
    expect(diff / n).toBeLessThan(25);
  }, 60000);
  it("ignores pictures that cannot be matched", async () => {
    const label = longLabel(1800, 330); const other = longLabel(1800, 330); for (let i = 0; i < other.data.length; i += 4) other.data[i] = other.data[i + 1] = other.data[i + 2] = 255 - other.data[i];
    const frames = [window_(label, 0, 12, 900, 300), window_(other, 100, 12, 900, 300), window_(label, 400, 12, 900, 300), window_(label, 800, 12, 900, 300)];
    const { placed } = await stitch(frames);
    expect(placed.map((p) => p.index)).not.toContain(1);
    expect(placed.length).toBeGreaterThanOrEqual(2);
  }, 60000);
  it("a single picture comes back unchanged", async () => {
    const f = window_(longLabel(900, 330), 0, 0, 900, 300); const { image } = await stitch([f]);
    expect(image.w).toBe(900);
  });
});
