// Optional AI label reader. The app sends ONE flattened picture of a pill-bottle label; Gemini reads the printed fields and
// returns them as JSON. Nothing is stored or logged here. Without GEMINI_API_KEY the endpoint is off and the app reads on-device.
export interface LabelFields { medicine?: string; strength?: string; form?: string; directions?: string; quantity?: number | null; refills?: number | null; prescriber?: string; pharmacy?: string; filled?: string; expires?: string }

const PROMPT = `You are reading a photo of a pharmacy prescription label on a medicine bottle. Return ONLY what is printed on the label.
- medicine: the drug name (e.g. "Lisinopril"). strength: e.g. "10 mg". form: e.g. "tablet".
- directions: the dosing instructions exactly as printed (e.g. "Take 1 tablet by mouth once daily").
- quantity: the number of pills/units dispensed (QTY / Quantity / Disp). refills: the number of refills remaining (Refills / RF); use 0 if it says no refills.
- prescriber: the prescribing doctor's name only (look for Dr., Prescriber, Doctor, Physician, "Prescribed by", MD/DO). Do not include the pharmacist.
- pharmacy: pharmacy name. filled / expires: dates as YYYY-MM-DD if printed.
NEVER return the patient's name, address, date of birth or Rx number. If a field is not printed or is unreadable, leave it null. Do not guess.`;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    medicine: { type: "STRING", nullable: true }, strength: { type: "STRING", nullable: true }, form: { type: "STRING", nullable: true },
    directions: { type: "STRING", nullable: true }, quantity: { type: "INTEGER", nullable: true }, refills: { type: "INTEGER", nullable: true },
    prescriber: { type: "STRING", nullable: true }, pharmacy: { type: "STRING", nullable: true }, filled: { type: "STRING", nullable: true }, expires: { type: "STRING", nullable: true },
  },
};

let pickedModel: string | null = null;
/** If the configured model is retired or unknown, ask Google which models this key can use and take the newest "flash" one. */
async function findModel(key: string): Promise<string | null> {
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) return null; const j: any = await r.json();
  const names: string[] = (j.models ?? []).filter((m: any) => (m.supportedGenerationMethods ?? []).includes("generateContent")).map((m: any) => String(m.name).replace(/^models\//, ""))
    .filter((n: string) => /^gemini-[\d.]+-flash$/.test(n));
  names.sort((a, b) => parseFloat(b.split("-")[1]) - parseFloat(a.split("-")[1]));
  return names[0] ?? null;
}

export async function readLabelWithGemini(base64Jpeg: string, key: string, model: string): Promise<LabelFields> {
  try { return await call(base64Jpeg, key, pickedModel ?? model); }
  catch (e: any) {
    if (!/ 404\b| 400\b/.test(String(e?.message))) throw e;
    const alt = await findModel(key);
    if (!alt || alt === (pickedModel ?? model)) throw e;
    const out = await call(base64Jpeg, key, alt); pickedModel = alt; console.warn(`[scan-ai] model "${model}" failed; using "${alt}"`); return out;
  }
}

async function call(base64Jpeg: string, key: string, model: string): Promise<LabelFields> {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: "image/jpeg", data: base64Jpeg } }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: SCHEMA, ...(/gemini-2\.5-flash(?!-lite)/.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}) }, // reading a label needs no long "thinking"; it only slows the answer
    }),
    signal: AbortSignal.timeout(50000),
  });
  if (!r.ok) {
    let msg = ""; try { msg = String(((await r.json()) as any)?.error?.message ?? "").slice(0, 200); } catch { /* ignore */ }
    console.error(`[scan-ai] Gemini ${r.status} (model ${model}): ${msg}`);   // never logs the picture
    throw new Error(`gemini ${r.status} ${msg}`);
  }
  const j: any = await r.json();
  const text: string = j?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
  return sanitize(JSON.parse(text));
}

const s = (v: unknown, max = 160) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
const n = (v: unknown, max: number) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max ? v : null);
export function sanitize(o: any): LabelFields {
  return { medicine: s(o?.medicine, 80), strength: s(o?.strength, 40), form: s(o?.form, 40), directions: s(o?.directions), quantity: n(o?.quantity, 9999), refills: n(o?.refills, 24), prescriber: s(o?.prescriber, 80), pharmacy: s(o?.pharmacy, 80), filled: s(o?.filled, 10), expires: s(o?.expires, 10) };
}
