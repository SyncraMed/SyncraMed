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

/** The whole flatten: scale to a good reading size, straighten, remove lighting, make black on white. */
export function flatten(g: Gray, target = 1800): { page: Gray; skew: number } {
  const k = target / Math.max(g.w, g.h); const sized = Math.abs(k - 1) > 0.1 ? resize(g, Math.round(g.w * k), Math.round(g.h * k)) : g;
  const skew = estimateSkew(sized);
  const straight = rotate(sized, skew);
  return { page: localThreshold(straight), skew };
}
