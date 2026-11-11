import { splitSentences } from "../shared/words.js";
export { contentWords, splitSentences } from "../shared/words.js";
const safeCode = (n: number) => { try { return String.fromCodePoint(n); } catch { return " "; } };
export function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => safeCode(Number(n)))
    .replace(/&amp;/g, "&").replace(/\u00a0/g, " ");
}
export function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  ).replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}
/** FDA label fields are long, shouty and full of section numbers. Make them readable without changing meaning. */
export function cleanLabelText(raw: string): string {
  return raw
    .replace(/^\s*\d+(\.\d+)*\s+[A-Z][A-Z &,/-]{3,}\s+/g, "") // "1 INDICATIONS AND USAGE "
    .replace(/\b(INDICATIONS(?: AND| &) USAGE|WARNINGS(?: AND PRECAUTIONS)?|ADVERSE REACTIONS|DRUG INTERACTIONS|DOSAGE AND ADMINISTRATION)\b[:.]?\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
export function truncateAtSentence(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const out: string[] = [];
  let n = 0;
  for (const s of splitSentences(text)) {
    if (n + s.length > maxChars && out.length) break;
    out.push(s); n += s.length + 1;
    if (n >= maxChars) break;
  }
  return out.join(" ");
}
