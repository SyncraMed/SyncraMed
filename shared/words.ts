const STOP = new Set("the a an and or of to in on for with is are was were be been it this that as by at from may can will not no if than then they their you your what how when does do should about take taking".split(" "));
export function contentWords(s: string): string[] {
  return (s.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) ?? []).filter((w) => !STOP.has(w));
}
export function splitSentences(text: string): string[] {
  return text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z0-9(])/).map((s) => s.trim()).filter(Boolean);
}
