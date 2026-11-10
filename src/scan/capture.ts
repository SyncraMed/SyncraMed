// Scan = take one still picture, flatten it, read it once. (Reading live video frame by frame was too blurry and
// too slow on phones.) Nothing here is uploaded: the picture is processed on the device.
import { flatten, pad, resize, sharpness, toGray, type Flat, type Gray } from "./flatten";
import { createReader, type Progress } from "./ocr";

/** The part of the picture that is read, as fractions. The box drawn on screen is only an aiming guide (6% / 12% in);
 *  we read a little beyond it so a label that is not perfectly centred does not lose its first or last line. */
export const GUIDE = { x0: 0.02, y0: 0.04, x1: 0.98, y1: 0.96 };

export interface Shot { gray: Gray; color: HTMLCanvasElement }

function shotFromSource(src: CanvasImageSource, sw: number, sh: number, box?: typeof GUIDE, maxSide = 2600): Shot {
  const sx = box ? sw * box.x0 : 0, sy = box ? sh * box.y0 : 0, cw = box ? sw * (box.x1 - box.x0) : sw, ch = box ? sh * (box.y1 - box.y0) : sh;
  const k = Math.min(1, maxSide / Math.max(cw, ch));
  const c = document.createElement("canvas"); c.width = Math.round(cw * k); c.height = Math.round(ch * k);
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(src, sx, sy, cw, ch, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height);
  return { gray: toGray(d.data, c.width, c.height), color: c };
}

/** Take several frames a split second apart and keep the sharpest one (phone cameras need a moment to focus). */
export async function grabSharpest(video: HTMLVideoElement, frames = 6, gap = 110): Promise<Shot> {
  let best: Shot | null = null, bestScore = -1;
  for (let i = 0; i < frames; i++) {
    if (video.videoWidth) {
      const sh = shotFromSource(video, video.videoWidth, video.videoHeight, GUIDE);
      const s = sharpness(sh.gray); if (s > bestScore) { best = sh; bestScore = s; }
    }
    await new Promise((r) => setTimeout(r, gap));
  }
  if (!best) throw new Error("no frame");
  return best;
}

/** A photo the person took or chose (the whole picture is used). */
export async function shotFromFile(file: Blob): Promise<Shot> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  try { return shotFromSource(bmp, bmp.width, bmp.height); } finally { bmp.close?.(); }
}

export function grayToCanvas(g: Gray): HTMLCanvasElement {
  const c = document.createElement("canvas"); c.width = g.w; c.height = g.h;
  const out = c.getContext("2d")!.createImageData(g.w, g.h);
  for (let i = 0, j = 0; i < g.data.length; i++, j += 4) { out.data[j] = out.data[j + 1] = out.data[j + 2] = g.data[i]; out.data[j + 3] = 255; }
  c.getContext("2d")!.putImageData(out, 0, 0);
  return c;
}

/** The same cut / straighten / trim applied to the colour picture, so the person sees their label in colour. */
function colourPage(color: HTMLCanvasElement, f: Flat): HTMLCanvasElement {
  const s = document.createElement("canvas"); s.width = f.sized.w; s.height = f.sized.h;
  s.getContext("2d")!.drawImage(color, 0, 0, s.width, s.height);
  const r = f.region ?? { x: 0, y: 0, w: s.width, h: s.height };
  const p = document.createElement("canvas"); p.width = r.w; p.height = r.h;
  const pg = p.getContext("2d")!; pg.fillStyle = "#ddd"; pg.fillRect(0, 0, r.w, r.h);
  pg.translate(r.w / 2, r.h / 2); pg.rotate((-f.skew * Math.PI) / 180); pg.drawImage(s, r.x, r.y, r.w, r.h, -r.w / 2, -r.h / 2, r.w, r.h);
  const o = document.createElement("canvas"); o.width = f.out.w; o.height = f.out.h;
  o.getContext("2d")!.drawImage(p, f.box.x, f.box.y, f.box.w, f.box.h, 0, 0, o.width, o.height);
  return o;
}

export interface LabelRead { texts: string[]; flatUrl: string; skew: number }

/** Flatten, then read it two ways (soft grey and hard black-and-white). The caller combines the readings. */
export async function readLabelImage(shot: Shot, onProgress?: Progress): Promise<LabelRead> {
  onProgress?.(5, "Flattening the label");
  await new Promise((r) => setTimeout(r, 20)); // let the screen update before the heavy work
  const f = flatten(shot.gray);
  const flatUrl = colourPage(shot.color, f).toDataURL("image/jpeg", 0.8);
  onProgress?.(15, "Loading the reader (first time only)");
  const reader = await createReader(undefined, { minConf: 45 });
  try {
    onProgress?.(30, "Reading the label");
    const texts = [await reader.read(grayToCanvas(pad(f.soft)))];
    onProgress?.(65, "Checking it a second way");
    texts.push(await reader.read(grayToCanvas(pad(f.hard))));
    onProgress?.(85, "One more look");
    // the reader is size-sensitive: smaller copies find words the big one misses
    for (const k of [0.65]) texts.push(await reader.read(grayToCanvas(pad(resize(f.soft, Math.round(f.soft.w * k), Math.round(f.soft.h * k))))));
    onProgress?.(100, "Done");
    return { texts, flatUrl, skew: f.skew };
  } finally { await reader.close(); }
}
