// Scan = take one still picture, flatten it, read it once. (Reading live video frame by frame was too blurry and
// too slow on phones.) Nothing here is uploaded: the picture is processed on the device.
import { crop, flatten, sharpness, toGray, type Gray } from "./flatten";
import { createReader, type Progress } from "./ocr";
import { parseLabel } from "./parse";

/** The part of the picture that is read, as fractions. The box drawn on screen is only an aiming guide (6% / 12% in);
 *  we read a little beyond it so a label that is not perfectly centred does not lose its first or last line. */
export const GUIDE = { x0: 0.02, y0: 0.04, x1: 0.98, y1: 0.96 };

function grayFromSource(src: CanvasImageSource, sw: number, sh: number, box?: typeof GUIDE, maxSide = 2600): Gray {
  const sx = box ? sw * box.x0 : 0, sy = box ? sh * box.y0 : 0, cw = box ? sw * (box.x1 - box.x0) : sw, ch = box ? sh * (box.y1 - box.y0) : sh;
  const k = Math.min(1, maxSide / Math.max(cw, ch));
  const c = document.createElement("canvas"); c.width = Math.round(cw * k); c.height = Math.round(ch * k);
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(src, sx, sy, cw, ch, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height);
  return toGray(d.data, c.width, c.height);
}

/** Take several frames a split second apart and keep the sharpest one (phone cameras need a moment to focus). */
export async function grabSharpest(video: HTMLVideoElement, frames = 6, gap = 110): Promise<Gray> {
  let best: Gray | null = null, bestScore = -1;
  for (let i = 0; i < frames; i++) {
    if (video.videoWidth) {
      const g = grayFromSource(video, video.videoWidth, video.videoHeight, GUIDE);
      const s = sharpness(g); if (s > bestScore) { best = g; bestScore = s; }
    }
    await new Promise((r) => setTimeout(r, gap));
  }
  if (!best) throw new Error("no frame");
  return best;
}

/** A photo the person took or chose (the whole picture is used). */
export async function grayFromFile(file: Blob): Promise<Gray> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  try { return grayFromSource(bmp, bmp.width, bmp.height); } finally { bmp.close?.(); }
}

export function grayToCanvas(g: Gray): HTMLCanvasElement {
  const c = document.createElement("canvas"); c.width = g.w; c.height = g.h;
  const out = c.getContext("2d")!.createImageData(g.w, g.h);
  for (let i = 0, j = 0; i < g.data.length; i++, j += 4) { out.data[j] = out.data[j + 1] = out.data[j + 2] = g.data[i]; out.data[j + 3] = 255; }
  c.getContext("2d")!.putImageData(out, 0, 0);
  return c;
}

/** Stretch contrast only (the older way). Used as a second try when the flattened page gives no medicine name. */
function stretched(g: Gray): Gray {
  let lo = 255, hi = 0; for (const v of g.data) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const span = Math.max(1, hi - lo); const data = new Uint8ClampedArray(g.data.length);
  for (let i = 0; i < data.length; i++) data[i] = ((g.data[i] - lo) * 255) / span;
  return { data, w: g.w, h: g.h };
}

export interface LabelRead { text: string; flatUrl: string; skew: number }

/** Flatten, then read once. If that finds no medicine name, also read the unflattened picture and combine the text. */
export async function readLabelImage(g: Gray, onProgress?: Progress): Promise<LabelRead> {
  onProgress?.(5, "Flattening the label");
  await new Promise((r) => setTimeout(r, 20)); // let the screen update before the heavy work
  const { page, skew } = flatten(g);
  const flat = grayToCanvas(page);
  const flatUrl = flat.toDataURL("image/jpeg", 0.7);
  onProgress?.(20, "Loading the reader (first time only)");
  const reader = await createReader();
  try {
    onProgress?.(40, "Reading the label");
    let text = await reader.read(flat);
    if (!parseLabel(text).nameCandidates.length) {
      onProgress?.(75, "Trying a second look");
      const again = await reader.read(grayToCanvas(stretched(crop(g, 0, 0, 1, 1))));
      text = [text, again].filter(Boolean).join("\n");
    }
    onProgress?.(100, "Done");
    return { text, flatUrl, skew };
  } finally { await reader.close(); }
}
