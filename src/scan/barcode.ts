// Barcode reading uses the browser's built-in BarcodeDetector (Chrome/Edge/Android/Safari 17+).
// Where it is missing, the Scan page simply hides the barcode option and label reading still works.
const FORMATS = ["upc_a", "upc_e", "ean_13", "ean_8", "code_128", "itf"];

export function barcodeSupported(): boolean { return typeof (globalThis as any).BarcodeDetector === "function"; }

function detector(): any { return new (globalThis as any).BarcodeDetector({ formats: FORMATS }); }

export async function barcodeFromImage(file: Blob): Promise<string | null> {
  if (!barcodeSupported()) return null;
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  try { const r = await detector().detect(bmp); return pick(r); } finally { bmp.close?.(); }
}

const pick = (r: { rawValue: string }[]): string | null => r.map((x) => x.rawValue.replace(/\D/g, "")).find((v) => v.length >= 8 && v.length <= 14) ?? null;

/** Opens the rear camera in `video` and resolves with the first medicine-length code seen. Call stop() to cancel. */
export function scanLive(video: HTMLVideoElement): { result: Promise<string | null>; stop: () => void } {
  let stopped = false; let stream: MediaStream | null = null; let timer = 0;
  const stop = () => { stopped = true; clearInterval(timer); stream?.getTracks().forEach((t) => t.stop()); video.srcObject = null; };
  const result = (async () => {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    if (stopped) { stop(); return null; }
    video.srcObject = stream; await video.play();
    const det = detector();
    return new Promise<string | null>((res) => {
      timer = window.setInterval(async () => {
        if (stopped) return res(null);
        try { const code = pick(await det.detect(video)); if (code) { stop(); res(code); } } catch { /* keep trying */ }
      }, 300);
    });
  })();
  return { result, stop };
}

let shared: any = null;
/** Look for a medicine barcode in the current video frame. Returns digits or null. */
export async function barcodeFromVideo(video: HTMLVideoElement): Promise<string | null> {
  if (!barcodeSupported() || !video.videoWidth) return null;
  shared ??= detector();
  try { return pick(await shared.detect(video)); } catch { return null; }
}
