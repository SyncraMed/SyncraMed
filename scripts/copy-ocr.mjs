// Copies the OCR engine and English language data into public/ocr so label scanning runs entirely
// from this app (no third-party CDN, works offline after first load, photos never leave the device).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."); // fileURLToPath decodes %20 and Windows drive letters
const out = path.join(root, "public", "ocr");
const nm = path.join(root, "node_modules");
const files = [
  ["tesseract.js/dist/worker.min.js", "worker.min.js"],
  ["tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "core/tesseract-core-simd-lstm.wasm.js"],
  ["tesseract.js-core/tesseract-core-lstm.wasm.js", "core/tesseract-core-lstm.wasm.js"],
  ["@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", "lang/eng.traineddata.gz"],
];
try {
  for (const [from, to] of files) {
    const dest = path.join(out, to);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(nm, from), dest);
  }
  console.log("OCR assets ready in public/ocr");
} catch (e) { console.warn("OCR assets not copied (run npm install first):", e.message); }
