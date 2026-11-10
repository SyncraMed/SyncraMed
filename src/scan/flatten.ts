// "Flattening" a photo of a bottle label so the text reader sees an even, straight, high-contrast page.
// Everything here works on plain grayscale arrays (no canvas), so it can be tested without a browser.
//
// Steps: pick the sharpest of several frames -> straighten the text lines (deskew) -> remove shadows and glare
// gradients (local thresholding) -> black text on a white page.

export interface Gray { data: Uint8ClampedArray; w: number; h: number }

export function toGray(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Gray {
  const data = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; j < data.length; i += 4, j++) data[j] = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
  return { data, w, h };
}

/** Crop a rectangle given as fractions of the width and height. */
export function crop(g: Gray, x0: number, y0: number, x1: number, y1: number): Gray {
  const sx = Math.max(0, Math.floor(g.w * x0)), sy = Math.max(0, Math.floor(g.h * y0));
  const w = Math.max(1, Math.min(g.w, Math.ceil(g.w * x1)) - sx), h = Math.max(1, Math.min(g.h, Math.ceil(g.h * y1)) - sy);
  const data = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) data.set(g.data.subarray((sy + y) * g.w + sx, (sy + y) * g.w + sx + w), y * w);
  return { data, w, h };
}

/** Bilinear resize. */
export function resize(g: Gray, w: number, h: number): Gray {
  const out = new Uint8ClampedArray(w * h);
  const fx = (g.w - 1) / Math.max(1, w - 1), fy = (g.h - 1) / Math.max(1, h - 1);
  for (let y = 0; y < h; y++) {
    const sy = y * fy, y0 = Math.floor(sy), y1 = Math.min(g.h - 1, y0 + 1), ty = sy - y0;
    for (let x = 0; x < w; x++) {
      const sx = x * fx, x0 = Math.floor(sx), x1 = Math.min(g.w - 1, x0 + 1), tx = sx - x0;
      const a = g.data[y0 * g.w + x0], b = g.data[y0 * g.w + x1], c = g.data[y1 * g.w + x0], d = g.data[y1 * g.w + x1];
      out[y * w + x] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    }
  }
  return { data: out, w, h };
}

/** How sharp the picture is (variance of a Laplacian). Used to choose the best of several frames. */
export function sharpness(g: Gray): number {
  const { data: d, w, h } = g; let n = 0, sum = 0, sq = 0;
  for (let y = 1; y < h - 1; y += 2) for (let x = 1; x < w - 1; x += 2) {
    const i = y * w + x; const l = 4 * d[i] - d[i - 1] - d[i + 1] - d[i - w] - d[i + w];
    sum += l; sq += l * l; n++;
  }
  return n ? sq / n - (sum / n) ** 2 : 0;
}

/** Local (adaptive) threshold: a pixel is text if it is clearly darker than the average around it.
 *  This removes uneven light, shadows and the bright streak a glossy bottle puts across the label. */
export function localThreshold(g: Gray, win = Math.max(15, Math.round(g.w / 14) | 1), drop = 0.13): Gray {
  const { data: d, w, h } = g; const W = w + 1;
  const ii = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += d[y * w + x]; ii[(y + 1) * W + x + 1] = ii[y * W + x + 1] + row; } }
  const r = win >> 1; const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const mean = (ii[y1 * W + x1] - ii[y0 * W + x1] - ii[y1 * W + x0] + ii[y0 * W + x0]) / ((x1 - x0) * (y1 - y0));
      out[y * w + x] = d[y * w + x] < mean * (1 - drop) ? 0 : 255;
    }
  }
  return { data: out, w, h };
}

/** Angle (degrees, -12..12) the page must be rotated by to make text lines horizontal. */
export function estimateSkew(g: Gray): number {
  const k = Math.min(1, 480 / g.w); const s = k < 1 ? resize(g, Math.round(g.w * k), Math.round(g.h * k)) : g;
  const bin = localThreshold(s, Math.max(11, Math.round(s.w / 18) | 1), 0.18);
  const xs: number[] = [], ys: number[] = [];
  for (let y = 0; y < bin.h; y++) for (let x = 0; x < bin.w; x++) if (bin.data[y * bin.w + x] === 0) { xs.push(x); ys.push(y); }
  if (xs.length < 80) return 0;
  const step = Math.max(1, Math.floor(xs.length / 20000));
  const score = (deg: number) => {
    const a = (deg * Math.PI) / 180, c = Math.cos(a), si = Math.sin(a); const hist = new Float64Array(bin.w + bin.h + 4); const off = bin.w + 2;
    for (let i = 0; i < xs.length; i += step) hist[Math.round(ys[i] * c - xs[i] * si) + off]++;
    let t = 0; for (let i = 1; i < hist.length; i++) { const dlt = hist[i] - hist[i - 1]; t += dlt * dlt; } // crisp rows -> big differences
    return t;
  };
  let best = 0, bs = score(0);
  for (let d = -12; d <= 12; d += 1) { const v = score(d); if (v > bs) { bs = v; best = d; } }
  for (let d = best - 0.9; d <= best + 0.91; d += 0.3) { const v = score(d); if (v > bs) { bs = v; best = d; } }
  return Math.abs(best) < 0.6 ? 0 : best; // ignore tiny angles: rotating would only blur
}

/** Rotate by `deg` (the same convention as estimateSkew). Edges are filled with the page colour. */
export function rotate(g: Gray, deg: number): Gray {
  if (!deg) return g;
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); const { data: d, w, h } = g;
  const out = new Uint8ClampedArray(w * h); const cx = w / 2, cy = h / 2;
  let fill = 0; for (let i = 0; i < d.length; i += 13) fill += d[i]; fill = fill / Math.ceil(d.length / 13);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = x - cx, py = y - cy; const sx = px * c - py * s + cx, sy = px * s + py * c + cy;
    if (sx < 0 || sy < 0 || sx >= w - 1 || sy >= h - 1) { out[y * w + x] = fill; continue; }
    const x0 = sx | 0, y0 = sy | 0, tx = sx - x0, ty = sy - y0;
    out[y * w + x] = (d[y0 * w + x0] * (1 - tx) + d[y0 * w + x0 + 1] * tx) * (1 - ty) + (d[(y0 + 1) * w + x0] * (1 - tx) + d[(y0 + 1) * w + x0 + 1] * tx) * ty;
  }
  return { data: out, w, h };
}

/** Even out the lighting without making the picture black and white: each pixel is compared with the average around it.
 *  Tesseract reads this softer image better than a hard black/white one, because thin strokes survive. */
export function normalize(g: Gray, win = Math.max(31, Math.round(g.w / 10) | 1)): Gray {
  const { data: d, w, h } = g; const W = w + 1;
  const ii = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += d[y * w + x]; ii[(y + 1) * W + x + 1] = ii[y * W + x + 1] + row; } }
  const r = win >> 1; const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const mean = (ii[y1 * W + x1] - ii[y0 * W + x1] - ii[y1 * W + x0] + ii[y0 * W + x0]) / ((x1 - x0) * (y1 - y0)) || 1;
      const ratio = d[y * w + x] / mean;               // ~1 on blank paper, ~0.2-0.5 on ink
      out[y * w + x] = Math.max(0, Math.min(255, ((ratio - 0.35) / 0.6) * 255));
    }
  }
  return { data: out, w, h };
}

export interface Box { x: number; y: number; w: number; h: number }

/** Where the printed label is: the block of cells that look like text (some ink, not solid, with text-like neighbours).
 *  Bottle plastic, the cap and the background are left out so the text gets more of the pixels. */
export function textBounds(g: Gray, pad = 0.04): Box {
  const full: Box = { x: 0, y: 0, w: g.w, h: g.h };
  const k = Math.min(1, 600 / g.w); const s = k < 1 ? resize(g, Math.round(g.w * k), Math.round(g.h * k)) : g;
  const bin = localThreshold(s, Math.max(11, Math.round(s.w / 20) | 1), 0.16);
  const C = 12, cols = Math.floor(s.w / C), rows = Math.floor(s.h / C); if (cols < 4 || rows < 4) return full;
  const texty = new Uint8Array(cols * rows);
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
    let dark = 0; for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) if (bin.data[(cy * C + y) * s.w + cx * C + x] === 0) dark++;
    const f = dark / (C * C); texty[cy * cols + cx] = f > 0.04 && f < 0.6 ? 1 : 0;
  }
  let x0 = cols, x1 = -1, y0 = rows, y1 = -1, n = 0;
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
    if (!texty[cy * cols + cx]) continue; let nb = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && texty[(cy + dy) * cols + cx + dx] && cy + dy >= 0 && cy + dy < rows && cx + dx >= 0 && cx + dx < cols) nb++;
    if (nb < 3) continue; n++;
    x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy);
  }
  if (n < 12 || x1 < 0) return full;
  const px = (x1 - x0 + 1) * C / s.w, py = (y1 - y0 + 1) * C / s.h;
  if (px * py > 0.9 || px < 0.2 || py < 0.12) return full; // nothing to gain, or it looks wrong: use everything
  const fx = 1 / k;
  const bx = Math.max(0, (x0 * C - pad * s.w)) * fx, by = Math.max(0, (y0 * C - pad * s.h)) * fx;
  const ex = Math.min(g.w, ((x1 + 1) * C + pad * s.w) * fx), ey = Math.min(g.h, ((y1 + 1) * C + pad * s.h) * fx);
  return { x: Math.floor(bx), y: Math.floor(by), w: Math.ceil(ex - bx), h: Math.ceil(ey - by) };
}

export function cropBox(g: Gray, b: Box): Gray { return crop(g, b.x / g.w, b.y / g.h, (b.x + b.w) / g.w, (b.y + b.h) / g.h); }

/** The paper label as a bright rectangle against a darker bottle, found with Otsu's threshold on a small blurred copy. */
export function labelRegion(g: Gray, pad = 0.03): Box | null {
  const k = Math.min(1, 220 / g.w); const s = resize(g, Math.max(8, Math.round(g.w * k)), Math.max(8, Math.round(g.h * k)));
  const win = 7, W = s.w + 1; const ii = new Float64Array(W * (s.h + 1));
  for (let y = 0; y < s.h; y++) { let row = 0; for (let x = 0; x < s.w; x++) { row += s.data[y * s.w + x]; ii[(y + 1) * W + x + 1] = ii[y * W + x + 1] + row; } }
  const sm = new Uint8ClampedArray(s.w * s.h), r = win >> 1;   // blur so the printing melts into the paper colour
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) { const x0 = Math.max(0, x - r), x1 = Math.min(s.w, x + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(s.h, y + r + 1); sm[y * s.w + x] = (ii[y1 * W + x1] - ii[y0 * W + x1] - ii[y1 * W + x0] + ii[y0 * W + x0]) / ((x1 - x0) * (y1 - y0)); }
  const hist = new Float64Array(256); for (const v of sm) hist[v]++;
  let sumAll = 0; for (let i = 0; i < 256; i++) sumAll += i * hist[i];
  let wB = 0, sumB = 0, best = 0, thr = 128; const total = sm.length;
  for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB) continue; const wF = total - wB; if (!wF) break; sumB += t * hist[t]; const mB = sumB / wB, mF = (sumAll - sumB) / wF; const v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; thr = t; } }
  const lab = new Int32Array(s.w * s.h).fill(-1); let bestC: { area: number; x0: number; y0: number; x1: number; y1: number } | null = null; let id = 0;
  for (let i = 0; i < sm.length; i++) {
    if (sm[i] <= thr || lab[i] >= 0) continue;
    const q = [i]; lab[i] = id; let area = 0, x0 = s.w, y0 = s.h, x1 = 0, y1 = 0;
    while (q.length) { const c = q.pop()!; const cx = c % s.w, cy = (c / s.w) | 0; area++; if (cx < x0) x0 = cx; if (cx > x1) x1 = cx; if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
      for (const n of [c - 1, c + 1, c - s.w, c + s.w]) { if (n < 0 || n >= sm.length || lab[n] >= 0 || sm[n] <= thr) continue; if ((n === c - 1 && cx === 0) || (n === c + 1 && cx === s.w - 1)) continue; lab[n] = id; q.push(n); } }
    id++; if (!bestC || area > bestC.area) bestC = { area, x0, y0, x1, y1 };
  }
  if (!bestC) return null;
  const bw = bestC.x1 - bestC.x0 + 1, bh = bestC.y1 - bestC.y0 + 1; const frac = (bw * bh) / (s.w * s.h);
  if (bestC.area / (bw * bh) < 0.45 || frac < 0.08 || frac > 0.88) return null; // not a clear rectangle on a darker background
  const fx = g.w / s.w, fy = g.h / s.h; const px = pad * g.w, py = pad * g.h;
  const x = Math.max(0, bestC.x0 * fx - px), y = Math.max(0, bestC.y0 * fy - py);
  return { x: Math.floor(x), y: Math.floor(y), w: Math.ceil(Math.min(g.w, (bestC.x1 + 1) * fx + px) - x), h: Math.ceil(Math.min(g.h, (bestC.y1 + 1) * fy + py) - y) };
}

export interface Flat {
  /** evenly lit, still grey-scale: the main picture to read */
  soft: Gray;
  /** hard black on white: a second opinion */
  hard: Gray;
  /** what was done, so the same steps can be applied to the colour picture */
  skew: number; region: Box | null; box: Box; sized: { w: number; h: number }; out: { w: number; h: number };
}

/** The whole flatten: size it, cut to the label, straighten it, trim to the printing, enlarge it, then even out the lighting. */
export function flatten(g: Gray, target = 1800, readWidth = 2000): Flat {
  const k = target / Math.max(g.w, g.h); const sized = Math.abs(k - 1) > 0.1 ? resize(g, Math.round(g.w * k), Math.round(g.h * k)) : g;
  const region = labelRegion(sized);
  const part = region ? cropBox(sized, region) : sized;
  const skew = estimateSkew(part);
  const straight = rotate(part, skew);
  const box = textBounds(straight);
  let label = cropBox(straight, box);
  const up = Math.min(2.5, Math.max(1, readWidth / label.w)); // small labels are enlarged so letters are tall enough to read
  if (up > 1.05) label = resize(label, Math.round(label.w * up), Math.round(label.h * up));
  return { soft: normalize(label), hard: localThreshold(label), skew, region, box, sized: { w: sized.w, h: sized.h }, out: { w: label.w, h: label.h } };
}

/** A white margin around the picture. Text that touches the edge of the image is often skipped by the reader (the first word of each line). */
export function pad(g: Gray, frac = 0.04): Gray {
  const m = Math.round(Math.max(g.w, g.h) * frac), w = g.w + 2 * m, h = g.h + 2 * m;
  const data = new Uint8ClampedArray(w * h).fill(255);
  for (let y = 0; y < g.h; y++) data.set(g.data.subarray(y * g.w, (y + 1) * g.w), (y + m) * w + m);
  return { data, w, h };
}
