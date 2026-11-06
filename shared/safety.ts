import type { QuestionVerdict } from "./education.js";

const EMERGENCY = /\b(overdos\w*|can'?t breathe|trouble breathing|chest pain|swelling (of|in) (my )?(face|throat|tongue)|anaphyla\w*|suicid\w*|kill myself|want to die|passed out|seizure|poison\w*)\b/i;
const ACTIONABLE: [RegExp, string][] = [
  [/\b(should|can|could|may) i (stop|quit|skip|start|take|combine|mix|double|increase|decrease|reduce|lower|raise|switch|change|crush|split)\b/i, "asks whether to change what they take"],
  [/\b(stop|quit|skip|double|halve|cut|crush|split)\b.*\b(dose|pill|tablet|medication|medicine|med)\b/i, "asks about changing a dose"],
  [/\bhow (much|many)\b.*\b(should|can|do) i\b/i, "asks for a personal dose"],
  [/\bis it (safe|ok|okay|fine) (to|for me)\b/i, "asks whether something is safe for them"],
  [/\b(pregnan\w*|breast-?feed\w*|nursing)\b/i, "pregnancy or breastfeeding decision"],
  [/\b(missed|forgot).*\b(dose)\b.*\b(what|should|can)\b/i, "asks what to do about a missed dose"],
  [/\bwith (alcohol|grapefruit|my other)\b.*\b(ok|okay|safe|should)\b/i, "asks if a combination is safe for them"],
  [/\b(diagnos\w+|do i have|am i (having|allergic))\b/i, "asks for a diagnosis"],
];

export function classifyQuestion(q: string): QuestionVerdict {
  if (EMERGENCY.test(q)) return { category: "emergency", reason: "describes a possible emergency" };
  for (const [re, reason] of ACTIONABLE) if (re.test(q)) return { category: "actionable", reason };
  return { category: "educational", reason: "general information question" };
}

export const EMERGENCY_MESSAGE =
  "If this is an emergency or you may have taken too much, call 911 (or your local emergency number) or Poison Control at 1-800-222-1222 now. If you are thinking about harming yourself, call or text 988.";
export const ACTIONABLE_MESSAGE =
  "That question depends on your full health picture, so it's one for your doctor or pharmacist. Below is what the trusted sources say in general. It is not advice for you personally.";
