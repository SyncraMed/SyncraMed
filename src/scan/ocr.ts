// On-device text recognition. The engine and English data are served from this app (public/ocr),
// so the photo is never uploaded anywhere.
export type Progress = (pct: number, label: string) => void;

/** Grayscale + contrast stretch in place: pill-bottle photos are curved, glossy and often dim. */
export function enhance(c: HTMLCanvasElement): HTMLCanvasElement {
  const g = c.getContext("2d", { willReadFrequently: true })!;
  const img = g.getImageData(0, 0, c.width, c.height); const d = img.data;
  let lo = 255, hi = 0;
  const gray = new Uint8ClampedArray(c.width * c.height);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) { const v = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0; gray[j] = v; if (v < lo) lo = v; if (v > hi) hi = v; }
  const span = Math.max(1, hi - lo);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) { const v = ((gray[j] - lo) * 255) / span; d[i] = d[i + 1] = d[i + 2] = v; }
  g.putImageData(img, 0, 0);
  return c;
}

export async function prepareImage(file: Blob, maxSide = 2000): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d", { willReadFrequently: true })!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return enhance(c);
}

/** One frame from the live camera, downscaled so each read takes about a second on a phone. */
export function frameFromVideo(v: HTMLVideoElement, maxSide = 1400): HTMLCanvasElement | null {
  if (!v.videoWidth) return null;
  const k = Math.min(1, maxSide / Math.max(v.videoWidth, v.videoHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
  c.getContext("2d", { willReadFrequently: true })!.drawImage(v, 0, 0, c.width, c.height);
  return enhance(c);
}

/** A reader that stays loaded between frames (loading the engine each time would be far too slow for live scanning). */
export async function createReader(onStatus?: (label: string) => void, opts: { psm?: string; minConf?: number } = {}) {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    workerPath: "/ocr/worker.min.js", corePath: "/ocr/core", langPath: "/ocr/lang", gzip: true,
    logger: (m: { status: string }) => { if (m.status.includes("loading")) onStatus?.("Loading the reader (first time only)"); },
  });
  if (opts.psm) await worker.setParameters({ tessedit_pageseg_mode: opts.psm as any });
  return { read: async (c: HTMLCanvasElement) => confidentText((await worker.recognize(c)).data, opts.minConf ?? 60), close: () => worker.terminate() };
}

// Words that belong on a pharmacy label are kept at a lower confidence: they are checked against this vocabulary instead.
const LABEL_WORDS = /^(qty|quantity|refills?|remaining|left|take|use|apply|inject|by|mouth|daily|twice|once|every|hours?|needed|tablets?|capsules?|caps?|tabs?|prescriber|prescribed|dr\.?|doctor|rx|mg|mcg|ml|with|food|at|bedtime|as)[:.,]?$/i;

/** Keep only words the engine is fairly sure of. Half-read or smudged words are what produce partial names and junk lines. */
export function confidentText(data: any, minConf = 60): string {
  const lines: any[] | undefined = data?.lines;
  if (!lines?.length) return data?.text ?? "";
  return lines
    .map((l) => (l.words ?? []).filter((w: any) => /[A-Za-z0-9]/.test(w.text) && (w.confidence >= minConf || (w.confidence >= 25 && (LABEL_WORDS.test(w.text.trim()) || /^\d{1,4}[.,:;]?$/.test(w.text.trim()) || /^[A-Za-z]+['’][A-Za-z]+[.,]?$/.test(w.text.trim()))))).map((w: any) => w.text).join(" "))
    .filter((t: string) => t.trim().length > 1).join("\n");
}

export async function readText(file: Blob, onProgress?: Progress): Promise<string> {
  onProgress?.(2, "Preparing photo");
  const canvas = await prepareImage(file);
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    workerPath: "/ocr/worker.min.js", corePath: "/ocr/core", langPath: "/ocr/lang", gzip: true,
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") onProgress?.(30 + Math.round(m.progress * 68), "Reading the label");
      else if (m.status.includes("loading")) onProgress?.(10, "Loading the reader (first time only)");
    },
  });
  try {
    const { data } = await worker.recognize(canvas);
    onProgress?.(100, "Done");
    return confidentText(data);
  } finally { await worker.terminate(); }
}
