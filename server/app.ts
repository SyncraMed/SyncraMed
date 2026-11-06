// The API only (no static files, no listening), so it can run as a long-lived server (server/index.ts) or as a Vercel function (api/index.ts).
import express from "express";
import { buildEducation } from "./education.js";
import { TRUSTED_SOURCES } from "./trusted.js";
import { anthropicSummarizer } from "./summarize.js";
import { resolveCandidates, lookupCode } from "./scan.js";
import type { EducationBundle } from "../shared/education.js";

const app = express();
// The phone apps load from capacitor://localhost (iOS) or https://localhost (Android), so they need cross-origin access to the read-only API.
const NATIVE_ORIGINS = new Set(["capacitor://localhost", "ionic://localhost", "https://localhost", "http://localhost"]);
app.use("/api", (req, res, next) => {
  const o = req.headers.origin;
  if (o && NATIVE_ORIGINS.has(o)) { res.setHeader("Access-Control-Allow-Origin", o); res.setHeader("Vary", "Origin"); }
  if (req.method === "OPTIONS") { res.setHeader("Access-Control-Allow-Methods", "GET"); res.setHeader("Access-Control-Allow-Headers", "Content-Type"); return res.sendStatus(204); }
  next();
});
const TTL = 12 * 3600 * 1000; // NLM asks implementers to cache 12-24h
const memo = new Map<string, { at: number; v: EducationBundle }>();
const summarizer = process.env.ANTHROPIC_API_KEY
  ? anthropicSummarizer(process.env.ANTHROPIC_API_KEY, process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5")
  : null;

// Privacy: the server only ever receives a medication or supplement NAME. No accounts, no health logs, no logging of queries.
app.get("/api/health", (_q, r) => r.json({ ok: true, summarizing: !!summarizer }));
app.get("/api/sources", (_q, r) => r.json(TRUSTED_SOURCES));

let inflight = 0;
app.get("/api/education", async (req, res) => {
  const q = String(req.query.q ?? "").trim().slice(0, 80);
  const kind = req.query.kind === "supplement" || req.query.kind === "drug" ? (req.query.kind as "drug" | "supplement") : undefined;
  if (q.length < 2) return res.status(400).json({ error: "Enter a medication or supplement name." });
  const key = `${kind ?? "auto"}:${q.toLowerCase()}`;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL) return res.json(hit.v);
  if (inflight >= 8) return res.status(429).json({ error: "Busy, try again shortly." });
  inflight++;
  try {
    const v = await buildEducation(q, { kind, summarizer, openfdaKey: process.env.OPENFDA_API_KEY, ncbiKey: process.env.NCBI_API_KEY });
    if (v.sources.length) memo.set(key, { at: Date.now(), v });
    res.json(v);
  } catch {
    res.status(502).json({ error: "Could not reach the trusted sources right now." });
  } finally { inflight--; }
});

// Scan helpers: receive a few candidate names or barcode digits, never the photo.
app.get("/api/resolve", async (req, res) => {
  const names = String(req.query.q ?? "").split("|").map((x) => x.trim()).filter(Boolean).slice(0, 4);
  if (!names.length) return res.status(400).json({ error: "No names." });
  try { res.json({ matches: await resolveCandidates(names) }); } catch { res.status(502).json({ error: "Could not reach RxNorm right now." }); }
});
app.get("/api/ndc", async (req, res) => {
  const code = String(req.query.code ?? "").replace(/\D/g, "");
  if (code.length < 8 || code.length > 14) return res.status(400).json({ error: "Not a medicine barcode." });
  try { res.json({ match: await lookupCode(code, process.env.OPENFDA_API_KEY) }); } catch { res.status(502).json({ error: "Could not reach openFDA right now." }); }
});

export default app;
