import { DeleteButton } from "../components/ui";
import React, { useState } from "react";
import { useApp, uid } from "../state";
import { COMMON_SYMPTOMS, sideEffectOverlap } from "../core/sideEffects";
import { addDays, ymd } from "../core/dates";
import { Cite } from "../components/ui";

const MOODS = ["Great", "Good", "Okay", "Low", "Rough"];

export default function Journal() {
  const { symptoms, saveSymptom, removeSymptom, meds, bundles, today } = useApp();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [sel, setSel] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [sev, setSev] = useState<1 | 2 | 3 | undefined>();
  const [mood, setMood] = useState("");
  const [note, setNote] = useState("");
  const [medIds, setMedIds] = useState<string[]>([]);
  const toggle = <T,>(a: T[], v: T) => (a.includes(v) ? a.filter((x) => x !== v) : [...a, v]);
  const active = meds.filter((m) => !m.archived);
  const flags = sideEffectOverlap(meds, symptoms, bundles, addDays(today, -30));
  const nameOf = (id: string) => meds.find((m) => m.id === id)?.name ?? "";

  const reset = () => { setOpen(false); setSel([]); setCustom(""); setSev(undefined); setMood(""); setNote(""); setMedIds([]); setDate(today); };
  const save = async () => {
    const symptoms = [...sel, ...custom.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)];
    if (!symptoms.length && !note.trim() && !mood) return;
    await saveSymptom({ id: uid(), date, symptoms, severity: sev, mood: mood || undefined, note: note.trim() || undefined, medIds: medIds.length ? medIds : undefined });
    reset();
  };
  const sorted = [...symptoms].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <div className="row between"><h1>Journal</h1>{!open && <button className="btn small" onClick={() => setOpen(true)}>New entry</button>}</div>
      <p className="sub">Track symptoms, side effects and how you feel.</p>
      {open && (
        <div className="card">
          <label className="field">Date<input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></label>
          <div className="field"><div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: 6 }}>What are you noticing?</div>
            <div className="chips">{COMMON_SYMPTOMS.map((s) => <button type="button" className="chip" key={s} aria-pressed={sel.includes(s)} onClick={() => setSel(toggle(sel, s))}>{s}</button>)}</div>
            <input style={{ marginTop: 10 }} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Something else? (separate with commas)" aria-label="Other symptoms" /></div>
          <div className="field"><div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: 6 }}>How bad?</div>
            <div className="chips">{(["Mild", "Moderate", "Severe"] as const).map((l, i) => <button type="button" className="chip" key={l} aria-pressed={sev === i + 1} onClick={() => setSev(sev === i + 1 ? undefined : ((i + 1) as 1 | 2 | 3))}>{l}</button>)}</div></div>
          <div className="field"><div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: 6 }}>Mood</div>
            <div className="chips">{MOODS.map((m) => <button type="button" className="chip" key={m} aria-pressed={mood === m} onClick={() => setMood(mood === m ? "" : m)}>{m}</button>)}</div></div>
          {active.length > 0 && <div className="field"><div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: 6 }}>Related to a medicine? <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></div>
            <div className="chips">{active.map((m) => <button type="button" className="chip" key={m.id} aria-pressed={medIds.includes(m.id)} onClick={() => setMedIds(toggle(medIds, m.id))}>{m.name}</button>)}</div></div>}
          <label className="field">Notes<textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything worth remembering for your next appointment" /></label>
          <div className="row"><button className="btn" onClick={save}>Save entry</button><button className="btn ghost" onClick={reset}>Cancel</button></div>
        </div>
      )}
      {flags.length > 0 && (
        <div className="card alert"><strong>Worth mentioning to your doctor or pharmacist</strong>
          {flags.map((f, i) => <p key={i} className="small" style={{ margin: "8px 0 0" }}>You logged <strong>{f.symptom}</strong> on {f.dates.length} day{f.dates.length > 1 ? "s" : ""}. The label for <strong>{nameOf(f.medId)}</strong> lists it: "{f.sentence}"<Cite ids={[f.sourceId]} bundleKey={f.bundleKey} /><br /><span className="muted">A match doesn't mean the medicine caused it.</span></p>)}
        </div>
      )}
      {sorted.length === 0 && !open && <div className="empty">No entries yet.</div>}
      {sorted.map((s) => (
        <div className="card" key={s.id}>
          <div className="row between"><strong>{new Date(s.date + "T00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</strong>
            <DeleteButton what="this entry" confirmText="Delete this journal entry?" onConfirm={() => removeSymptom(s.id)} /></div>
          <div className="chips" style={{ margin: "8px 0" }}>{s.symptoms.map((x) => <span className="badge" key={x}>{x}</span>)}{s.severity && <span className="badge solid">{["", "Mild", "Moderate", "Severe"][s.severity]}</span>}{s.mood && <span className="badge">Mood: {s.mood}</span>}</div>
          {s.medIds?.length ? <p className="small muted" style={{ margin: 0 }}>Related to: {s.medIds.map(nameOf).join(", ")}</p> : null}
          {s.note && <p style={{ margin: "6px 0 0" }}>{s.note}</p>}
        </div>
      ))}
    </>
  );
}
