import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiUrl } from "../core/api";
import { essentials, parseLabel, type ScanResult } from "../scan/parse";
import { grabSharpest, grayFromFile, readLabelImage } from "../scan/capture";
import type { Gray } from "../scan/flatten";
import { AddModeSwitch, BackLink } from "../components/ui";
import { barcodeFromImage, barcodeFromVideo } from "../scan/barcode";

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
  const [cam, setCam] = useState(false);
  const [camReady, setCamReady] = useState(false);
  const [preview, setPreview] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const stopCamera = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; if (video.current) video.current.srcObject = null; setCam(false); setCamReady(false); };
  useEffect(() => () => { stream.current?.getTracks().forEach((t) => t.stop()); }, []);

  const finish = async (r: ScanResult, text: string, flatUrl: string, extra?: string) => {
    const names = [...(extra ? [extra] : []), ...r.nameCandidates];
    const m = names.length ? (await api<{ matches: Match[] }>(`/api/resolve?q=${encodeURIComponent(names.join("|"))}`))?.matches ?? [] : [];
    const opts = uniq([...m.map((x) => tc(x.name)), ...names]);
    setMatches(m); setPick(opts[0] ?? ""); setRes(r); setRaw(text); setPreview(flatUrl); setBusy(null);
  };

  /** Flatten one still picture and read it once. */
  const readPicture = async (g: Gray, code: string | null) => {
    try {
      setBusy({ pct: 3, label: "Flattening the label" });
      const { text, flatUrl } = await readLabelImage(g, (pct, label) => setBusy({ pct, label }));
      const r = essentials(parseLabel(text));
      let fromCode: string | undefined;
      if (code) fromCode = (await api<{ match: { name: string } | null }>(`/api/ndc?code=${code}`))?.match?.name;
      if (!r.nameCandidates.length && !fromCode) { setBusy(null); setRaw(text); setPreview(flatUrl); setRes(r); setPick(""); return; }
      await finish(r, text, flatUrl, fromCode);
    } catch {
      setBusy(null);
      setError("We couldn't read that picture. Try again in good light with the label flat and filling the box, or type the medicine instead.");
    }
  };

  const onPhoto = async (file?: File | null) => {
    if (!file) return;
    setError(""); setRes(null);
    try { setBusy({ pct: 1, label: "Preparing the photo" }); const [g, code] = await Promise.all([grayFromFile(file), barcodeFromImage(file).catch(() => null)]); await readPicture(g, code); }
    catch { setBusy(null); setError("We couldn't open that photo. Try another, or type the medicine instead."); }
  };

  // ---- camera: show the live view, then the shutter takes ONE still. The still is flattened and read once.
  const openCamera = async () => {
    setError(""); setRes(null); setCam(true); setCamReady(false);
    await new Promise((r) => setTimeout(r, 50));
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 2560 } }, audio: false });
      stream.current = s; const v = video.current!; v.srcObject = s; await v.play(); setCamReady(true);
    } catch { stopCamera(); setError("The camera isn't available. Allow camera access in your browser, or use Take a photo."); }
  };

  const shutter = async () => {
    const v = video.current; if (!v) return;
    try {
      setCamReady(false);
      const [g, code] = await Promise.all([grabSharpest(v), barcodeFromVideo(v)]);
      stopCamera(); await readPicture(g, code);
    } catch { stopCamera(); setBusy(null); setError("We couldn't capture that. Try again, or use Take a photo."); }
  };

  const name = (custom || pick).trim();
  const go = () => { nav("/meds/new", { state: { prefill: { ...res, name } } }); };

  const row = (k: string, v?: string | number | null) => v === undefined || v === null || v === "" ? null : <div className="row between top" style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}><span className="muted">{k}</span><strong style={{ textAlign: "right" }}>{v}</strong></div>;

  return (
    <>
      <BackLink to="/meds" label="All medications" />
      <AddModeSwitch mode="scan" />
      <h1>Scan a bottle</h1>
      <p className="sub">Take a picture of the label. Everything is read on this phone and never uploaded. You review it all before anything is saved.</p>

      {!res && !busy && !cam && (
        <>
          <div className="card">
            {typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && <button className="btn block" onClick={openCamera}>Open the camera</button>}
            <label className="btn ghost block" style={{ cursor: "pointer", marginTop: 10 }}>Take a photo of the label
              <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => onPhoto(e.target.files?.[0])} /></label>
            <label className="btn ghost block" style={{ cursor: "pointer", marginTop: 10 }}>Choose a photo
              <input type="file" accept="image/*" hidden onChange={(e) => onPhoto(e.target.files?.[0])} /></label>
          </div>
          <p className="muted small"><strong>How it works:</strong> You take one picture. We flatten it (straighten the text and remove shadows and glare) and then read it once. Use good light, keep the label flat and fill the box. Barcodes of products in the FDA label list are read too.</p>
        </>
      )}

      {cam && (
        <div className="card camera" aria-live="polite">
          <div className="viewfinder">
            <video ref={video} playsInline muted aria-label="Camera view" />
            <div className="guide" aria-hidden><i /><i /><i /><i /></div>
          </div>
          <p className="muted small" style={{ margin: "10px 0" }}>{camReady ? "Fit the label inside the box, hold steady, then press the button." : "Starting the camera…"}</p>
          <div className="row between">
            <button className="btn ghost" onClick={stopCamera}>Cancel</button>
            <button className="shutter" onClick={shutter} disabled={!camReady} aria-label="Take the picture"><span /></button>
            <span style={{ width: 84 }} />
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
          {preview && <img src={preview} alt="The flattened label we read" style={{ width: "100%", maxHeight: 180, objectFit: "contain", borderRadius: 12, marginBottom: 12, border: "1px solid var(--line)", background: "#fff" }} />}
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
          {raw && <details style={{ marginBottom: 14 }}><summary>Text we read from the picture</summary><pre style={{ whiteSpace: "pre-wrap", fontSize: "0.8rem" }}>{raw}</pre></details>}

          <div className="row"><button className="btn" disabled={!name} onClick={go}>Continue</button><button className="btn ghost" onClick={() => { setRes(null); setPreview(""); setCustom(""); void openCamera(); }}>Scan again</button></div>
        </>
      )}
    </>
  );
}
