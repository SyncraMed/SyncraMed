// Scan = take one still picture, flatten it, read it once. (Reading live video frame by frame was too blurry and
// too slow on phones.) Nothing here is uploaded: the picture is processed on the device.
import { flatten, pad, resize, sharpness, toGray, type Flat, type Gray } from "./flatten";
import { createReader, type Progress } from "./ocr";
import { aiReadText } from "./ai";
import { alignFrames, composeFrames, type Rgba } from "./stitch";

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

// ---- Wrap-around scan: record pictures while the bottle is turned, then join them into one long picture.
export interface SweepFrame { gray: Gray; blob: Blob }
const SWEEP_GRAY_W = 640;     // pictures are matched at this width (cheap) ...
const SWEEP_FULL = 1280;      // ... and joined at this size (sharp enough to read)
const MAX_FRAMES = 60;

export class SweepRecorder {
  frames: SweepFrame[] = [];
  private timer: ReturnType<typeof setInterval> | null = null; private busy = false; private prev: Gray | null = null;
  constructor(private video: HTMLVideoElement, private onCount: (n: number) => void, private onFull?: () => void) {}
  start() { this.timer = setInterval(() => void this.tick(), 240); void this.tick(); }
  private async tick() {
    if (this.busy || !this.video.videoWidth || this.frames.length >= MAX_FRAMES) return;
    this.busy = true;
    try {
      const v = this.video, sw = v.videoWidth, sh = v.videoHeight, bx = GUIDE;
      const cw = sw * (bx.x1 - bx.x0), ch = sh * (bx.y1 - bx.y0), k = Math.min(1, SWEEP_FULL / Math.max(cw, ch));
      const big = document.createElement("canvas"); big.width = Math.round(cw * k); big.height = Math.round(ch * k);
      big.getContext("2d")!.drawImage(v, sw * bx.x0, sh * bx.y0, cw, ch, 0, 0, big.width, big.height);
      const gk = SWEEP_GRAY_W / big.width; const sm = document.createElement("canvas"); sm.width = SWEEP_GRAY_W; sm.height = Math.round(big.height * gk);
      const sg = sm.getContext("2d", { willReadFrequently: true })!; sg.drawImage(big, 0, 0, sm.width, sm.height);
      const id = sg.getImageData(0, 0, sm.width, sm.height); const gray = toGray(id.data, sm.width, sm.height);
      const th = resize(gray, 32, 24);
      if (this.prev) { let d = 0; for (let i = 0; i < th.data.length; i++) d += Math.abs(th.data[i] - this.prev.data[i]); if (d / th.data.length < 2.5) return; } // nothing moved yet
      this.prev = th;
      const blob: Blob = await new Promise((res, rej) => big.toBlob((b) => (b ? res(b) : rej(new Error("blob"))), "image/jpeg", 0.88));
      this.frames.push({ gray, blob }); this.onCount(this.frames.length);
      if (this.frames.length >= MAX_FRAMES) this.onFull?.();
    } finally { this.busy = false; }
  }
  stop(): SweepFrame[] { if (this.timer) clearInterval(this.timer); this.timer = null; return this.frames; }
}

async function rgbaOf(blob: Blob): Promise<Rgba> {
  const bmp = await createImageBitmap(blob);
  try { const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height; const g = c.getContext("2d", { willReadFrequently: true })!; g.drawImage(bmp, 0, 0); const d = g.getImageData(0, 0, c.width, c.height); return { data: d.data, w: c.width, h: c.height }; }
  finally { bmp.close?.(); }
}

/** Join the recorded pictures into one long picture. With too few usable pictures, the sharpest single one is used. */
export async function stitchSweep(frames: SweepFrame[], onProgress?: Progress): Promise<{ shot: Shot; used: number }> {
  if (!frames.length) throw new Error("no frames");
  onProgress?.(3, "Lining up the pictures");
  let placed = await alignFrames(frames.map((f) => f.gray), { onProgress: (d, t) => onProgress?.(3 + (d / Math.max(1, t)) * 12, `Lining up the pictures (${d} of ${t})`) });
  if (placed.length < 2) { let bi = 0, bs = -1; frames.forEach((f, i) => { const sc = sharpness(f.gray); if (sc > bs) { bs = sc; bi = i; } }); placed = [{ index: bi, x: 0, y: 0, gain: 1 }]; }
  onProgress?.(16, "Joining them into one picture");
  const first = await rgbaOf(frames[placed[0].index].blob); const scale = first.w / frames[placed[0].index].gray.w;
  const image = await composeFrames(async (i) => (i === placed[0].index ? first : rgbaOf(frames[i].blob)), placed, scale);
  const c = document.createElement("canvas"); c.width = image.w; c.height = image.h;
  c.getContext("2d")!.putImageData(new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.w, image.h), 0, 0);
  return { shot: { gray: toGray(image.data, image.w, image.h), color: c }, used: placed.length };
}

export interface LabelRead { texts: string[]; flatUrl: string; skew: number; ai?: boolean }

/** Flatten, then read it two ways (soft grey and hard black-and-white). The caller combines the readings. */
export async function readLabelImage(shot: Shot, onProgress?: Progress, wide = false): Promise<LabelRead> {
  onProgress?.(5, "Flattening the label");
  await new Promise((r) => setTimeout(r, 20)); // let the screen update before the heavy work
  const f = flatten(shot.gray, wide ? Math.min(4200, Math.max(shot.gray.w, shot.gray.h)) : 1800); // a joined picture is kept at full size so the small print stays readable
  const colour = colourPage(shot.color, f);
  const flatUrl = colour.toDataURL("image/jpeg", 0.8);
  onProgress?.(10, "Reading the label");
  const ai = await aiReadText(colour);                 // only when the server has an AI key; otherwise null
  if (ai) { onProgress?.(100, "Done"); return { texts: [ai], flatUrl, skew: f.skew, ai: true }; }
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
