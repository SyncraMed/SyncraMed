import type { Block, SourcePassage } from "./education.js";

export const ASK_DISCLAIMER =
  "For education only. This is general reference information from trusted public sources, not medical advice, a diagnosis or a treatment plan. It does not replace your doctor or pharmacist. Check with them before changing anything you take. In an emergency call 911.";

export interface AskResponse {
  question: string;
  category: "educational" | "actionable" | "emergency";
  /** Plain-language answer. Every block cites source ids. Empty when no verified source covered the question. */
  answer: Block[];
  /** "ai" = rewritten by the model and then checked against the sources; "excerpt" = verbatim source sentences; "none" = nothing verified was found. */
  mode: "ai" | "excerpt" | "none";
  /** Only the sources that were actually retrieved for this question (ids match the cites). */
  sources: SourcePassage[];
  topics: string[];
  notices: string[];
  banner?: string;
  disclaimer: string;
  fetchedAt: string;
}
