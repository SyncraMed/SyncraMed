// Joining several pictures of a bottle (taken while it is turned) into one long picture of the whole label.
// Plain arrays only, no canvas, so it can be tested without a browser.
//
// 1. align: for each new picture, find how far it moved against the last picture we kept (cross-correlation,
//    coarse to fine). Pictures that cannot be matched, or that barely moved, are dropped.
// 2. compose: paste the kept pictures at those positions. Each pixel comes mostly from the picture where it is nearest
//    the centre, because the edges of a picture of a round bottle are the most squashed.
import { resize, type Gray } from "./flatten";

export interface Rgba { data: Uint8ClampedArray; w: number; h: number }
export interface Placement { index: number; x: number; y: number; gain: number }

function half(g: Gray): Gray {
  const w = g.w >> 1, h = g.h >> 1, out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = 2 * y * g.w + 2 * x; out[y * w + x] = (g.data[i] + g.data[i + 1] + g.data[i + g.w] + g.data[i + g.w + 1]) >> 2; }
  return { data: out, w, h };
}

/** Print only: remove the average brightness around each pixel so lighting changes between pictures do not matter. */
function edges(g: Gray): Gray {
  const { data: d, w, h } = g; const r = Math.max(2, Math.round(w / 40)); const W = w + 1; const ii = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += d[y * w + x]; ii[(y + 1) * W + x + 1] = ii[y * W + x + 1] + row; } }
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) { const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) { const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const mean = (ii[y1 * W + x1] - ii[y0 * W + x1] - ii[y1 * W + x0] + ii[y0 * W + x0]) / ((x1 - x0) * (y1 - y0));
      out[y * w + x] = Math.max(0, Math.min(255, 128 + (d[y * w + x] - mean) * 2)); } }
  return { data: out, w, h };
}

export function pyramid(g: Gray, levels = 4): Gray[] {
  const out: Gray[] = [edges(g)]; let cur = g;
  while (out.length < levels && cur.w >= 80 && cur.h >= 60) { cur = half(cur); out.push(edges(cur)); }
  return out;
}

/** Zero-mean normalised correlation of b placed at (dx, dy) on a. null if they overlap too little. */
function ncc(a: Gray, b: Gray, dx: number, dy: number, minFrac: number, step: number): number | null {
  const x0 = Math.max(0, -dx), x1 = Math.min(b.w, a.w - dx), y0 = Math.max(0, -dy), y1 = Math.min(b.h, a.h - dy);
  if (x1 <= x0 || y1 <= y0 || (x1 - x0) * (y1 - y0) < minFrac * Math.min(a.w * a.h, b.w * b.h)) return null;
  let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  for (let y = y0; y < y1; y += step) { const ra = (y + dy) * a.w + dx, rb = y * b.w;
    for (let x = x0; x < x1; x += step) { const va = a.data[ra + x], vb = b.data[rb + x]; n++; sa += va; sb += vb; saa += va * va; sbb += vb * vb; sab += va * vb; } }
  const den = Math.sqrt((n * saa - sa * sa) * (n * sbb - sb * sb));
  return den < 1e-6 ? null : (n * sab - sa * sb) / den;
}

export interface Shift { dx: number; dy: number; score: number }

/** Where picture `b` sits relative to picture `a` (in a's pixels). */
export function findShift(pa: Gray[], pb: Gray[], minOverlap = 0.3): Shift | null {
  const L = Math.min(pa.length, pb.length) - 1; const ca = pa[L], cb = pb[L];
  let best: Shift | null = null; const mx = Math.round(ca.w * 0.8), my = Math.round(ca.h * 0.25);
  for (let dy = -my; dy <= my; dy++) for (let dx = -mx; dx <= mx; dx++) {
    const s = ncc(ca, cb, dx, dy, minOverlap, 1); if (s === null) continue;
    const adj = s - 0.02 * (Math.abs(dy) / Math.max(1, my)); // lines of text repeat, so prefer the smaller sideways-up/down move
    if (!best || adj > best.score) best = { dx, dy, score: adj };
  }
  if (!best) return null;
  let { dx, dy } = best;
  for (let l = L - 1; l >= 0; l--) {
    dx *= 2; dy *= 2; let bx = dx, by = dy, bs = -2; const step = pa[l].w > 400 ? 2 : 1;
    for (let ey = -2; ey <= 2; ey++) for (let ex = -2; ex <= 2; ex++) { const s = ncc(pa[l], pb[l], dx + ex, dy + ey, minOverlap * 0.8, step); if (s !== null && s > bs) { bs = s; bx = dx + ex; by = dy + ey; } }
    dx = bx; dy = by; if (l === 0) best = { dx, dy, score: bs };
  }
  return best;
}

function meanOverlap(a: Gray, b: Gray, dx: number, dy: number): [number, number] {
  const x0 = Math.max(0, -dx), x1 = Math.min(b.w, a.w - dx), y0 = Math.max(0, -dy), y1 = Math.min(b.h, a.h - dy);
  let sa = 0, sb = 0, n = 0;
  for (let y = y0; y < y1; y += 3) for (let x = x0; x < x1; x += 3) { sa += a.data[(y + dy) * a.w + x + dx]; sb += b.data[y * b.w + x]; n++; }
  return n ? [sa / n, sb / n] : [1, 1];
}

export interface AlignOptions { minScore?: number; minMove?: number; onProgress?: (done: number, total: number) => void }

/** Decide which pictures to use and where each goes. Positions are in the pixels of the pictures given. */
export async function alignFrames(grays: Gray[], o: AlignOptions = {}): Promise<Placement[]> {
  const minScore = o.minScore ?? 0.3, minMove = o.minMove ?? 0.22;
  if (!grays.length) return [];
  const pyr = new Map<number, Gray[]>(); const P = (i: number) => { let p = pyr.get(i); if (!p) { p = pyramid(grays[i]); pyr.set(i, p); } return p; };
  const used: Placement[] = [{ index: 0, x: 0, y: 0, gain: 1 }]; let ref = used[0];
  let last: Placement | null = null; // newest picture that matched, even if it moved too little to keep
  for (let i = 1; i < grays.length; i++) {
    o.onProgress?.(i, grays.length - 1);
    if (i % 2 === 0) await new Promise((r) => setTimeout(r, 0)); // keep the page responsive
    const s = findShift(P(ref.index), P(i));
    if (!s || s.score < minScore) continue;
    const [ma, mb] = meanOverlap(grays[ref.index], grays[i], s.dx, s.dy);
    const cand: Placement = { index: i, x: ref.x + s.dx, y: ref.y + s.dy, gain: Math.max(0.7, Math.min(1.4, ref.gain * (ma / Math.max(1, mb)))) };
    last = cand;
    const w = grays[i].w, h = grays[i].h;
    if (Math.abs(s.dx) >= minMove * w || Math.abs(s.dy) >= minMove * h) { used.push(cand); ref = cand; last = null; }
  }
  if (last && (Math.abs(last.x - ref.x) > 0.06 * grays[0].w || Math.abs(last.y - ref.y) > 0.06 * grays[0].h)) used.push(last); // the end of the sweep
  const mx = Math.min(...used.map((u) => u.x)), my = Math.min(...used.map((u) => u.y));
  return used.map((u) => ({ ...u, x: u.x - mx, y: u.y - my }));
}

/** Paste the chosen pictures into one. `scale` converts placement units to the pixels of the pictures `get` returns. */
export async function composeFrames(get: (index: number) => Promise<Rgba>, placed: Placement[], scale = 1): Promise<Rgba> {
  if (!placed.length) throw new Error("nothing to join");
  const first = await get(placed[0].index); const fw = first.w, fh = first.h;
  const W = Math.ceil(Math.max(...placed.map((p) => p.x)) * scale) + fw, H = Math.ceil(Math.max(...placed.map((p) => p.y)) * scale) + fh;
  const acc = new Float32Array(W * H * 3), wsum = new Float32Array(W * H);
  const wx = new Float32Array(fw), wy = new Float32Array(fh);
  for (let x = 0; x < fw; x++) wx[x] = Math.pow(Math.sin((Math.PI * (x + 0.5)) / fw), 3) + 1e-3;
  for (let y = 0; y < fh; y++) wy[y] = Math.pow(Math.sin((Math.PI * (y + 0.5)) / fh), 1.5) + 1e-3;
  for (const p of placed) {
    const f = p.index === placed[0].index ? first : await get(p.index); const ox = Math.round(p.x * scale), oy = Math.round(p.y * scale);
    for (let y = 0; y < f.h; y++) { const row = (oy + y) * W + ox;
      for (let x = 0; x < f.w; x++) {
        const w = wx[x] * wy[y]; const wp = w * w * w; const di = row + x, si = (y * f.w + x) * 4;
        acc[di * 3] += f.data[si] * p.gain * wp; acc[di * 3 + 1] += f.data[si + 1] * p.gain * wp; acc[di * 3 + 2] += f.data[si + 2] * p.gain * wp; wsum[di] += wp; } }
  }
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { const w = wsum[i] || 1; out[i * 4] = acc[i * 3] / w; out[i * 4 + 1] = acc[i * 3 + 1] / w; out[i * 4 + 2] = acc[i * 3 + 2] / w; out[i * 4 + 3] = 255; }
  return { data: out, w: W, h: H };
}

/** Convenience for pictures held in memory (used by tests). */
export async function stitch(frames: Rgba[], o: AlignOptions = {}): Promise<{ image: Rgba; placed: Placement[] }> {
  const grays = frames.map((f) => { const d = new Uint8ClampedArray(f.w * f.h); for (let i = 0, j = 0; j < d.length; i += 4, j++) d[j] = (f.data[i] * 299 + f.data[i + 1] * 587 + f.data[i + 2] * 114) / 1000; return { data: d, w: f.w, h: f.h } as Gray; });
  const placed = await alignFrames(grays, o);
  return { image: await composeFrames(async (i) => frames[i], placed, 1), placed };
}
export { resize };
