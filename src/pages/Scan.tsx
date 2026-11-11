import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiUrl } from "../core/api";
import { aiEnabled } from "../scan/ai";
import { parseDirections, type ScanResult } from "../scan/parse";
import { grabSharpest, shotFromFile, readLabelImage, stitchSweep, SweepRecorder, type Shot } from "../scan/capture";
import { mergeReads } from "../scan/merge";
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
  const [custom, setCustom] = useState<string | null>(null);
  const [cam, setCam] = useState(false);
  const [camReady, setCamReady] = useState(false);
  const [preview, setPreview] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [sweepN, setSweepN] = useState<number | null>(null); // null = not recording; a number = pictures recorded so far
  const rec = useRef<SweepRecorder | null>(null);
  const stopCamera = () => { rec.current?.stop(); rec.current = null; setSweepN(null); stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; if (video.current) video.current.srcObject = null; setCam(false); setCamReady(false); };
  const [aiOn, setAiOn] = useState(false);
  useEffect(() => { void aiEnabled().then(setAiOn); }, []);
  useEffect(() => () => { stream.current?.getTracks().forEach((t) => t.stop()); }, []);

  const finish = async (r: ScanResult, text: string, flatUrl: string, extra?: string) => {
    const names = [...(extra ? [extra] : []), ...r.nameCandidates];
    const m = names.length ? (await api<{ matches: Match[] }>(`/api/resolve?q=${encodeURIComponent(names.join("|"))}`))?.matches ?? [] : [];
    const opts = uniq([...m.map((x) => tc(x.name)), ...names]);
    setMatches(m); setPick(opts[0] ?? ""); setRes(r); setRaw(text); setPreview(flatUrl); setBusy(null);
  };

  /** Flatten one still picture and read it once. */
  const readPicture = async (g: Shot, code: string | null, wide = false) => {
    try {
      setBusy({ pct: 3, label: "Flattening the label" });
      const { texts, flatUrl } = await readLabelImage(g, (pct, label) => setBusy({ pct, label }), wide);
      const r = mergeReads(texts); const text = texts.join("\n\n— second reading —\n");
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
    try { setBusy({ pct: 1, label: "Preparing the photo" }); const [g, code] = await Promise.all([shotFromFile(file), barcodeFromImage(file).catch(() => null)]); await readPicture(g, code); }
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

  const startSweep = () => {
    const v = video.current; if (!v) return;
    setSweepN(0); const r = new SweepRecorder(v, setSweepN, () => void doneSweep()); rec.current = r; r.start();
  };
  const doneSweep = async () => {
    const r = rec.current; const v = video.current; if (!r) return;
    const code = v ? await barcodeFromVideo(v).catch(() => null) : null;
    const frames = r.stop(); rec.current = null; setSweepN(null); stopCamera();
    if (!frames.length) { setError("We didn't capture anything. Hold the label in the box and turn the bottle slowly, then press Done."); return; }
    try {
      setBusy({ pct: 2, label: "Lining up the pictures" });
      const { shot, used } = await stitchSweep(frames, (pct, label) => setBusy({ pct, label }));
      setJoined(used); await readPicture(shot, code, used > 1);
    } catch { setBusy(null); setError("We couldn't join those pictures. Try again more slowly, or use the single picture button."); }
  };
  const [joined, setJoined] = useState(0);

  const shutter = async () => {
    const v = video.current; if (!v) return;
    try {
      setCamReady(false);
      const [g, code] = await Promise.all([grabSharpest(v), barcodeFromVideo(v)]);
      stopCamera(); await readPicture(g, code);
    } catch { stopCamera(); setBusy(null); setError("We couldn't capture that. Try again, or use Take a photo."); }
  };

  const name = (custom ?? pick).trim();
  const [fd, setFd] = useState({ strength: "", directions: "", quantity: "", refills: "", prescriber: "" });
  useEffect(() => { if (res) setFd({ strength: res.strength ?? "", directions: res.directions ?? "", quantity: res.quantity?.toString() ?? "", refills: res.refills?.toString() ?? "", prescriber: res.prescriber ?? "" }); }, [res]);
  const go = () => {
    if (!res) return;
    const dirs = fd.directions.trim();
    const p = dirs !== (res.directions ?? "") ? parseDirections(dirs) : { schedule: res.schedule, perDose: res.perDose };
    nav("/meds/new", { state: { prefill: { ...res, name, strength: fd.strength.trim() || undefined, directions: dirs || undefined, quantity: fd.quantity.trim() ? Number(fd.quantity) : undefined, refills: fd.refills.trim() ? Number(fd.refills) : undefined, prescriber: fd.prescriber.trim() || undefined, schedule: p.schedule, perDose: p.perDose } } });
  };
  const missing = [!name, !fd.strength.trim(), !fd.directions.trim(), !fd.quantity.trim(), !fd.refills.trim(), !fd.prescriber.trim()].filter(Boolean).length;
  const fld = (label: string, key: keyof typeof fd, ph: string, inputMode?: "numeric") => (
    <label className={`field scanfield ${fd[key].trim() ? "" : "missing"}`}>{label}{!fd[key].trim() && <em> · not found, type it</em>}
      <input value={fd[key]} inputMode={inputMode} placeholder={ph} onChange={(e) => setFd({ ...fd, [key]: inputMode ? e.target.value.replace(/\D/g, "") : e.target.value })} /></label>
  );

  return (
    <>
      <BackLink to="/meds" label="All medications" />
      <AddModeSwitch mode="scan" />

      {!res && !busy && (
        <>
          <h1>Scan a bottle</h1>
          <p className="sub">Take a picture of the label. It is read on this phone and never uploaded.</p>
          <div className="card">
            {typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && <button className="btn block" onClick={openCamera}>Open the camera</button>}
            <label className="btn ghost block" style={{ cursor: "pointer", marginTop: 10 }}>Take a photo
              <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => onPhoto(e.target.files?.[0])} /></label>
            <label className="btn ghost block" style={{ cursor: "pointer", marginTop: 10 }}>Choose a photo
              <input type="file" accept="image/*" hidden onChange={(e) => onPhoto(e.target.files?.[0])} /></label>
            {aiOn && <p className="small muted" style={{ margin: "12px 0 0" }}>To read the label accurately, the label picture is sent to Google's Gemini AI. It is not stored by SyncraMed, and the patient name is never read or kept.</p>}
          </div>
          <p className="muted small">We straighten the label, even out shadows and glare, and read it. You check and fix every field before anything is saved.</p>
        </>
      )}

      {cam && (
        <div className="modal camera" role="dialog" aria-modal="true" aria-label="Camera" onKeyDown={(e) => { if (e.key === "Escape") stopCamera(); }}>
          <div className="modalbar"><strong>Scan the label</strong><button className="btn ghost small" onClick={stopCamera}>Cancel</button></div>
          <div className="vfwrap">
            <div className="vfbox">
              <video ref={video} playsInline muted aria-label="Camera view" />
              <div className="guide" aria-hidden><i /><i /><i /><i /></div>
            </div>
          </div>
          {sweepN === null ? (
            <>
              <p className="modalhint">{camReady ? "Short label: fit it in the box and press the round button. Long label that wraps around the bottle: press “Scan the whole bottle”." : "Starting the camera…"}</p>
              <div className="modalfoot two">
                <button className="btn ghost wrap" onClick={startSweep} disabled={!camReady}>Scan the whole bottle</button>
                <button className="shutter" onClick={shutter} disabled={!camReady} aria-label="Take one picture"><span /></button>
                <span className="wrap" />
              </div>
            </>
          ) : (
            <>
              <p className="modalhint" role="status">Start with one end of the label inside the box, then turn the bottle slowly so the whole label passes through. Keep it level and steady. Press Done at the other end.</p>
              <div className="sweepbar" aria-hidden><i style={{ width: `${Math.min(100, (sweepN / 60) * 100)}%` }} /></div>
              <div className="modalfoot two">
                <span className="wrap sweepcount">{sweepN} {sweepN === 1 ? "picture" : "pictures"}</span>
                <button className="shutter stop" onClick={doneSweep} aria-label="Done"><span /></button>
                <button className="btn wrap" onClick={doneSweep}>Done</button>
              </div>
            </>
          )}
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
        <div className="modal sheet review" role="dialog" aria-modal="true" aria-label="Check the label"><div className="sheetin">
          <div className="row between" style={{ marginBottom: 8 }}><h1 style={{ margin: 0, fontSize: "1.4rem" }}>Check the label</h1>
            <span className={`badge ${missing ? "" : "solid"}`}>{missing ? `${missing} to fill in` : "All found"}</span></div>
          {preview && <div className="flatwrap"><img className="flatimg" src={preview} alt="Your label, straightened" style={joined > 1 ? { height: "16vh", width: "auto", maxWidth: "none" } : undefined} /></div>}
          {joined > 1 && <p className="muted small" style={{ margin: "-4px 0 8px" }}>Joined from {joined} pictures. Swipe the label sideways to look along it.</p>}

          {(() => { const opts = uniq([...matches.map((m) => tc(m.name)), ...res.nameCandidates]); return opts.length ? (
            <div className="chips" role="group" aria-label="Medicine name" style={{ marginBottom: 8 }}>
              {opts.map((o) => <button key={o} type="button" className="chip" aria-pressed={custom === null && pick === o} onClick={() => { setPick(o); setCustom(null); }}>{o}{matches.some((m) => tc(m.name).toLowerCase() === o.toLowerCase()) ? " ✓" : ""}</button>)}
            </div>) : null; })()}
          <label className={`field scanfield ${name ? "" : "missing"}`}>Medicine{!name && <em> · not found, type it</em>}<input value={custom ?? pick} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. Lisinopril" /></label>
          <div className="grid2 keep">{fld("Dose", "strength", "e.g. 10 mg")}{fld("Prescriber", "prescriber", "Dr. Name")}</div>
          {fld("Directions", "directions", "e.g. Take 1 tablet by mouth daily")}
          <div className="grid2 keep">{fld("Quantity", "quantity", "e.g. 30", "numeric")}{fld("Refills left", "refills", "e.g. 2", "numeric")}</div>

          {res.schedule && <p className="muted small" style={{ margin: "0 0 8px" }}>Reminders will start as: {res.schedule.kind === "prn" ? "as needed" : res.schedule.kind === "daily" ? `every day at ${res.schedule.times.join(", ")}` : res.schedule.kind === "interval" ? `every ${res.schedule.everyDays} days` : "certain days"}. You can change them next. ✓ = matched to a real medicine in RxNorm. The patient name is never read or kept.</p>}
          {raw && <details style={{ marginBottom: 10 }}><summary className="small">Text we read</summary><pre style={{ whiteSpace: "pre-wrap", fontSize: "0.78rem" }}>{raw}</pre></details>}

          <div className="row sheetfoot"><button className="btn" style={{ flex: 1 }} disabled={!name} onClick={go}>Continue</button><button className="btn ghost" onClick={() => { setRes(null); setPreview(""); setCustom(null); setJoined(0); void openCamera(); }}>Scan again</button><button className="btn ghost" onClick={() => { setRes(null); setPreview(""); setCustom(null); }}>Close</button></div>
        </div></div>
      )}
    </>
  );
}
