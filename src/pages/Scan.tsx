import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiUrl } from "../core/api";
import { essentials, parseLabel, type ScanResult } from "../scan/parse";
import { createReader, frameFromVideo, readText } from "../scan/ocr";
import { ScanAccumulator } from "../scan/live";
import { AddModeSwitch, BackLink } from "../components/ui";
import { barcodeFromImage, barcodeFromVideo, barcodeSupported } from "../scan/barcode";

export interface Prefill extends Partial<ScanResult> { name?: string }

type Match = { input: string; name: string; rxcui: string };
const tc = (s: string) => s.replace(/\b([a-z])/g, (m) => m.toUpperCase());
const uniq = (xs: string[]) => { const seen = new Set<string>(); return xs.filter((x) => { const k = x.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }); };
const api = async <T,>(url: string): Promise<T | null> => { try { const r = await fetch(apiUrl(url)); return r.ok ? ((await r.json()) as T) : null; } catch { return null; } };

export default function Scan() {
  const nav = useNavigate();
  const [busy, setBusy] = useState<{ pct: number; label: string } | null>(null);
  const [error, setError] = useState("");
  const [res, setRes] = useState<ScanResult | null>(null);
  const [raw, setRaw] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [pick, setPick] = useState("");
  const [custom, setCustom] = useState("");
  const [live, setLive] = useState(false);
  const [preview, setPreview] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const stopLive = useRef<() => void>(() => {});
  useEffect(() => () => { stopLive.current(); }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const finish = async (r: ScanResult, text: string, extra?: string) => {
    const names = [...(extra ? [extra] : []), ...r.nameCandidates];
    const m = names.length ? (await api<{ matches: Match[] }>(`/api/resolve?q=${encodeURIComponent(names.join("|"))}`))?.matches ?? [] : [];
    const opts = uniq([...m.map((x) => tc(x.name)), ...names]);
    setMatches(m); setPick(opts[0] ?? ""); setRes(r); setRaw(text); setBusy(null);
  };

  const onPhoto = async (file?: File | null) => {
    if (!file) return;
    setError(""); setRes(null); setPreview(URL.createObjectURL(file));
    try {
      setBusy({ pct: 1, label: "Starting" });
      const [text, code] = await Promise.all([readText(file, (pct, label) => setBusy({ pct, label })), barcodeFromImage(file).catch(() => null)]);
      const r = essentials(parseLabel(text));
      let fromCode: string | undefined;
      if (code) fromCode = (await api<{ match: { name: string } | null }>(`/api/ndc?code=${code}`))?.match?.name;
      if (!r.nameCandidates.length && !fromCode) { setBusy(null); setRaw(text); setRes(r); setPick(""); return; }
      await finish(r, text, fromCode);
    } catch (e) {
      setBusy(null);
      setError("We couldn't read that photo. Try again in good light with the label flat, or type the medicine instead.");
    }
  };

  // ---- live scan: keep the camera open, read a frame about every second, keep what repeats
  const [seen, setSeen] = useState<{ label: string; value: string }[]>([]);
  const [hint, setHint] = useState("Starting the camera…");
  const acc = useRef<ScanAccumulator | null>(null);
  const done = useRef<(auto: boolean) => void>(() => {});

  const startLive = async () => {
    setError(""); setRes(null); setSeen([]); setHint("Starting the camera…"); setLive(true);
    await new Promise((r) => setTimeout(r, 50));
    let running = true; let stream: MediaStream | null = null; let reader: Awaited<ReturnType<typeof createReader>> | null = null; let bcTimer = 0;
    const a = (acc.current = new ScanAccumulator());
    let barcodeName: string | undefined;
    const checking = new Set<string>();
    const checkNames = () => { for (const n of a.needsChecking()) { if (checking.has(n)) continue; checking.add(n);
      fetch(apiUrl(`/api/resolve?q=${encodeURIComponent(n)}`)).then((r) => (r.ok ? r.json() : Promise.reject())).then((j: { matches: Match[] }) => { a.setChecked(n, j.matches[0]?.name ?? null); setSeen(a.summary()); })
        .catch(() => { a.offline = true; setSeen(a.summary()); }); } };
    const stop = () => { running = false; clearInterval(bcTimer); stream?.getTracks().forEach((t) => t.stop()); if (video.current) video.current.srcObject = null; void reader?.close(); };
    stopLive.current = stop;
    const complete = async () => {
      if (!running) return; const r = a.result(); const text = a.lastText; stop(); setLive(false); setBusy({ pct: 90, label: "Matching the medicine name" });
      await finish(r, text, barcodeName);
    };
    done.current = () => void complete();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } }, audio: false });
      if (!running) { stop(); return; }
      const v = video.current!; v.srcObject = stream; await v.play();
      setHint("Loading the reader (first time only)…");
      reader = await createReader(setHint);
      if (!running) { stop(); return; }
      setHint("Hold the label steady and fill the frame.");
      if (barcodeSupported()) bcTimer = window.setInterval(async () => {
        const code = await barcodeFromVideo(v); if (!code || barcodeName) return;
        const hit = (await api<{ match: { name: string } | null }>(`/api/ndc?code=${code}`))?.match; if (hit) { barcodeName = hit.name; a.add("", hit.name); setSeen(a.summary()); }
      }, 500);
      const t0 = Date.now(); let readyAt: number | undefined;
      while (running) {
        const frame = frameFromVideo(v);
        if (frame) {
          const text = await reader.read(frame); if (!running) break;
          a.add(text); checkNames(); setSeen(a.summary());
          // Once the medicine and its strength or directions are solid, keep looking a few more seconds for quantity, refills and prescriber.
          if (a.complete()) { await complete(); return; }
          if (a.ready()) { readyAt ??= Date.now(); setHint("Got the medicine. Looking for quantity, refills and prescriber…"); if (Date.now() - readyAt > 6000) { await complete(); return; } }
          if (Date.now() - t0 > 20000) setHint("Still looking. Turn the bottle so the label faces the camera, or use Take a photo.");
        }
        await new Promise((r) => setTimeout(r, 150));
      }
    } catch { stop(); setLive(false); setBusy(null); setError("The camera isn't available. Allow camera access in your browser, or use Take a photo."); }
  };

  const name = (custom || pick).trim();
  const go = () => { nav("/meds/new", { state: { prefill: { ...res, name } } }); };

  const row = (k: string, v?: string | number | null) => v === undefined || v === null || v === "" ? null : <div className="row between top" style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}><span className="muted">{k}</span><strong style={{ textAlign: "right" }}>{v}</strong></div>;

  return (
    <>
      <BackLink to="/meds" label="All medications" />
      <AddModeSwitch mode="scan" />
      <h1>Scan a bottle</h1>
      <p className="sub">Point your camera at the label, or take a photo. Everything is read on this phone and never uploaded. You review it all before anything is saved.</p>

      {!res && !busy && !live && (
        <>
          <div className="card">
            {typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && <button className="btn block" onClick={startLive}>Live scan with the camera</button>}
            <label className="btn ghost block" style={{ cursor: "pointer", marginTop: 10 }}>Take a photo of the label
              <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => onPhoto(e.target.files?.[0])} /></label>
            <label className="btn ghost block" style={{ cursor: "pointer", marginTop: 10 }}>Choose a photo
              <input type="file" accept="image/*" hidden onChange={(e) => onPhoto(e.target.files?.[0])} /></label>

          </div>
          <p className="muted small"><strong>Tips:</strong> Live scan reads the label as you hold it up and picks the details that repeat, so slowly turn the bottle and hold it steady in good light. It also reads barcodes of products in the FDA label list.</p>
        </>
      )}

      {live && (
        <div className="card" aria-live="polite">
          <div style={{ position: "relative" }}>
            <video ref={video} playsInline muted style={{ width: "100%", borderRadius: 12, background: "#000", display: "block" }} aria-label="Camera view" />
            <div aria-hidden style={{ position: "absolute", inset: "12% 6%", border: "2px solid rgba(255,255,255,.85)", borderRadius: 14, pointerEvents: "none" }} />
          </div>
          <p className="muted small" style={{ margin: "10px 0 6px" }}>{hint}</p>
          {seen.length > 0 && <div className="chips" aria-label="Found so far" style={{ marginBottom: 10 }}>{seen.map((x) => <span className="badge solid" key={x.label}>{x.label}: {x.value}</span>)}</div>}
          <div className="row">
            <button className="btn" disabled={!seen.length} onClick={() => done.current(false)}>Use what's found</button>
            <button className="btn ghost" onClick={() => { stopLive.current(); setLive(false); }}>Cancel</button>
          </div>
        </div>
      )}

      {busy && (
        <div className="card" role="status" aria-live="polite">
          <strong>{busy.label}…</strong>
          <div style={{ height: 8, borderRadius: 4, background: "var(--line)", marginTop: 10 }}><div style={{ width: `${busy.pct}%`, height: 8, borderRadius: 4, background: "var(--fg)", transition: "width .3s" }} /></div>
        </div>
      )}

      {error && <div className="banner" role="alert">{error}</div>}

      {res && !busy && (
        <>
          {preview && <img src={preview} alt="Your photo" style={{ maxHeight: 140, borderRadius: 12, marginBottom: 12 }} />}
          <h2>Is this the right medicine?</h2>
          {(() => { const opts = uniq([...matches.map((m) => tc(m.name)), ...res.nameCandidates]); return (
            <div className="chips" role="group" aria-label="Medicine name" style={{ marginBottom: 10 }}>
              {opts.map((o) => <button key={o} type="button" className="chip" aria-pressed={!custom && pick === o} onClick={() => { setPick(o); setCustom(""); }}>{o}{matches.some((m) => tc(m.name).toLowerCase() === o.toLowerCase()) ? " ✓" : ""}</button>)}
            </div>); })()}
          <label className="field">{res.nameCandidates.length || matches.length ? "Or type the name" : "We couldn't find a name. Type it"}<input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. Lisinopril" /></label>
          <p className="muted small">✓ = matched to a real medicine name in RxNorm (NLM). Names you didn't pick are not saved.</p>

          {res.warnings.length > 0 && <div className="banner">{res.warnings.join(" ")}</div>}

          <h2>What we read</h2>
          <div className="card">
            {row("Dose", [res.strength, res.form].filter(Boolean).join(" "))}
            {row("Directions", res.directions)}
            {row("Quantity", res.quantity)}{row("Refills left", res.refills)}{row("Prescriber", res.prescriber)}
            {row("Suggested reminders", res.schedule ? (res.schedule.kind === "prn" ? "As needed" : res.schedule.kind === "daily" ? `Every day at ${res.schedule.times.join(", ")}` : res.schedule.kind === "interval" ? `Every ${res.schedule.everyDays} days` : "Certain days") : undefined)}
          </div>
          <p className="muted small">Reminder times are suggestions based on the directions. Change anything on the next screen. We never read or keep the patient name.</p>
          {raw && <details style={{ marginBottom: 14 }}><summary>Text we read from the photo</summary><pre style={{ whiteSpace: "pre-wrap", fontSize: "0.8rem" }}>{raw}</pre></details>}

          <div className="row"><button className="btn" disabled={!name} onClick={go}>Continue</button><button className="btn ghost" onClick={() => { setRes(null); setPreview(""); setCustom(""); }}>Scan again</button></div>
        </>
      )}
    </>
  );
}
