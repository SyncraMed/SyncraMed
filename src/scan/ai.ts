// Optional: if the server has a Gemini key, the flattened label picture is sent there to be read. The reply is turned into
// plain label text so the same parser, field filters and review screen are used either way. Any failure -> null, and the
// on-device reader takes over.
import { apiUrl } from "../core/api";

let enabled: Promise<boolean> | null = null;
export function aiEnabled(): Promise<boolean> {
  enabled ??= fetch(apiUrl("/api/health"), { signal: AbortSignal.timeout(4000) }).then((r) => r.json()).then((j) => !!j?.aiScan).catch(() => false);
  return enabled;
}

export interface Fields { medicine?: string; strength?: string; form?: string; directions?: string; quantity?: number | null; refills?: number | null; prescriber?: string; pharmacy?: string; filled?: string; expires?: string }
const us = (d?: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d ?? ""); return m ? `${m[2]}/${m[3]}/${m[1]}` : undefined; };

export function fieldsToText(f: Fields): string {
  const L: string[] = [];
  if (f.pharmacy) L.push(f.pharmacy);
  if (f.medicine) L.push([f.medicine, f.strength, f.form].filter(Boolean).join(" "));
  if (f.directions) L.push(f.directions);
  if (f.quantity != null) L.push(`QTY: ${f.quantity}`);
  if (f.refills != null) L.push(`REFILLS: ${f.refills}`);
  if (f.prescriber) L.push(`PRESCRIBER: ${f.prescriber}`);
  if (us(f.filled)) L.push(`FILLED ${us(f.filled)}`);
  if (us(f.expires)) L.push(`DISCARD AFTER ${us(f.expires)}`);
  return L.join("\n");
}

export interface AiRead { text: string; fields: number; data: Fields }
export let aiLastError = "";
export async function aiReadText(canvas: HTMLCanvasElement): Promise<AiRead | null> {
  aiLastError = "";
  try {
    if (!(await aiEnabled())) return null;
    const k = Math.min(1, 1500 / Math.max(canvas.width, canvas.height));
    const c = document.createElement("canvas"); c.width = Math.round(canvas.width * k); c.height = Math.round(canvas.height * k);
    c.getContext("2d")!.drawImage(canvas, 0, 0, c.width, c.height);
    const r = await fetch(apiUrl("/api/scan-ai"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: c.toDataURL("image/jpeg", 0.9) }), signal: AbortSignal.timeout(60000) });
    if (!r.ok) { let d = ""; try { d = String(((await r.json()) as { detail?: string }).detail ?? ""); } catch { /* ignore */ } aiLastError = `AI reader error ${r.status}${d ? ": " + d : ""}`; return null; }
    const data = ((await r.json()) as { fields?: Fields }).fields ?? {};
    const text = fieldsToText(data);
    const n = text.split("\n").filter((l) => l.trim()).length;
    if (n < 1) aiLastError = "AI reader returned nothing"; return n >= 1 ? { text, fields: n, data } : null;
  } catch { aiLastError = "AI reader unreachable"; return null; }
}
