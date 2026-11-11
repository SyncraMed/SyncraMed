import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import type { Prefill } from "./Scan";
import { useApp, uid } from "../state";
import type { MedKind, Medication, Schedule } from "../core/types";
import { describeSchedule } from "../core/schedule";
import { supplyStatus } from "../core/supply";
import { AddModeSwitch, BackLink, Cite, DeleteButton, EducationView } from "../components/ui";
import { ymd } from "../core/dates";

const KIND_LABEL: Record<MedKind, string> = { rx: "Prescription", otc: "Over-the-counter", supplement: "Vitamin / supplement" };

export function MedList() {
  const { meds, today, interactions, removeMed } = useApp();
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const list = meds.filter((m) => (showArchived ? true : !m.archived) && m.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <div className="row between"><h1>Medications</h1><div className="row"><Link to="/meds/scan" className="btn ghost small">Scan</Link><Link to="/meds/new" className="btn small">Add</Link></div></div>
      <p className="sub">Prescriptions, over-the-counter medicines, vitamins and supplements, all in one list.</p>
      {meds.length > 3 && <input aria-label="Search medications" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 14 }} />}
      {list.length === 0 && <div className="empty">{meds.length ? "No matches." : <>Nothing here yet.<br /><br /><div className="row" style={{ justifyContent: "center" }}><Link className="btn" to="/meds/scan">Scan a bottle</Link><Link className="btn ghost" to="/meds/new">Type it in</Link></div></>}</div>}
      {list.map((m) => { const s = supplyStatus(m, today); const hasFlag = interactions.some((f) => f.a === m.id || f.b === m.id); return (
        <div key={m.id} className="card" style={{ opacity: m.archived ? 0.6 : 1 }}>
          <Link to={`/meds/${m.id}`} style={{ display: "block", textDecoration: "none" }} aria-label={`Open ${m.name}`}>
            <div className="row between top"><div><strong>{m.name}</strong> {m.strength && <span className="muted">{m.strength}</span>}<br /><span className="muted small">{describeSchedule(m)}{m.indication ? ` · ${m.indication}` : ""}</span></div><span className="badge">{KIND_LABEL[m.kind]}</span></div>
            {hasFlag && <div className="small" style={{ marginTop: 6 }}><span className="badge red">Label lists an interaction</span> <span className="muted">Open to see why</span></div>}
            {(s.level === "soon" || s.level === "now") && <div className="small" style={{ marginTop: 6 }}><strong>Refill soon</strong>: about {s.daysLeft} days left</div>}
          </Link>
          <div className="actions">
            <Link to={`/meds/${m.id}/learn`} className="btn small" aria-label={`Get AI education about ${m.name}`}>AI education</Link>
            <Link to={`/meds/${m.id}/edit`} className="btn ghost small" aria-label={`Edit ${m.name}`}>Edit</Link>
            <DeleteButton what={m.name} confirmText={`Delete ${m.name} and its dose history from this device? This can't be undone.`} onConfirm={() => removeMed(m.id)} />
          </div>
        </div>); })}
      {meds.some((m) => m.archived) && <button className="btn ghost small" onClick={() => setShowArchived((v) => !v)}>{showArchived ? "Hide" : "Show"} stopped medications</button>}
    </>
  );
}

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
type Freq = "daily" | "weekdays" | "interval" | "prn";

export function MedForm() {
  const { id } = useParams(); const nav = useNavigate();
  const { meds, saveMed, pharmacies, savePharmacy, refreshEducation } = useApp();
  const [saved, setSaved] = useState<Medication | null>(null);
  const existing = meds.find((m) => m.id === id);
  const pf = ((useLocation().state as { prefill?: Prefill } | null)?.prefill ?? {}) as Prefill;
  const s0 = existing?.schedule ?? pf.schedule ?? ({ kind: "daily", times: ["08:00"] } as Schedule);
  const matchedPharm = pharmacies.find((p) => pf.pharmacy?.name && p.name.toLowerCase() === pf.pharmacy.name.toLowerCase());
  const [name, setName] = useState(existing?.name ?? pf.name ?? "");
  const [kind, setKind] = useState<MedKind>(existing?.kind ?? pf.kind ?? "rx");
  const [strength, setStrength] = useState(existing?.strength ?? pf.strength ?? "");
  const [form, setForm] = useState(existing?.form ?? pf.form ?? "");
  const [indication, setIndication] = useState(existing?.indication ?? pf.indication ?? "");
  const [freq, setFreq] = useState<Freq>(s0.kind);
  const [times, setTimes] = useState<string[]>("times" in s0 ? s0.times : ["08:00"]);
  const [days, setDays] = useState<number[]>(s0.kind === "weekdays" ? s0.days : [1, 3, 5]);
  const [every, setEvery] = useState(s0.kind === "interval" ? s0.everyDays : 14);
  const [start, setStart] = useState(existing?.startDate ?? pf.filled ?? ymd(new Date()));
  const [end, setEnd] = useState(existing?.endDate ?? "");
  const [doctor, setDoctor] = useState(existing?.prescriber?.name ?? pf.prescriber ?? "");
  const [doctorPhone, setDoctorPhone] = useState(existing?.prescriber?.phone ?? "");
  const [pharmacyId, setPharmacyId] = useState(existing?.pharmacyId ?? matchedPharm?.id ?? "");
  const [onHand, setOnHand] = useState(existing?.supply?.onHand?.toString() ?? pf.quantity?.toString() ?? "");
  const [perDose, setPerDose] = useState(existing?.supply?.perDose?.toString() ?? pf.perDose?.toString() ?? "1");
  const [refills, setRefills] = useState(existing?.supply?.refillsLeft?.toString() ?? pf.refills?.toString() ?? "");
  const [expires, setExpires] = useState(existing?.supply?.expires ?? pf.expires ?? "");
  const [admin, setAdmin] = useState(existing?.administration ?? pf.directions ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const schedule: Schedule = freq === "prn" ? { kind: "prn" } : freq === "daily" ? { kind: "daily", times } : freq === "weekdays" ? { kind: "weekdays", days, times } : { kind: "interval", everyDays: every, times };
    const num = (v: string) => (v === "" ? undefined : Number(v));
    const supply = { onHand: num(onHand), perDose: num(perDose), refillsLeft: num(refills), expires: expires || undefined };
    const m: Medication = {
      ...(existing ?? { id: uid(), createdAt: new Date().toISOString() }), name: name.trim(), kind, strength: strength.trim() || undefined, form: form.trim() || undefined,
      indication: indication.trim() || undefined, schedule, startDate: start, endDate: end || undefined,
      prescriber: doctor || doctorPhone ? { name: doctor || undefined, phone: doctorPhone || undefined } : undefined,
      pharmacyId: pharmacyId || undefined, supply: supply.onHand !== undefined || supply.refillsLeft !== undefined || supply.expires ? supply : undefined,
      administration: admin.trim() || undefined, notes: notes.trim() || undefined,
    };
    await saveMed(m);
    if (existing) { void refreshEducation(m, existing.name !== m.name); nav(`/meds/${m.id}`); }
    else setSaved(m); // new medicine: show the "what next?" screen (which also checks for interactions)
  };
  const setTime = (i: number, v: string) => setTimes((t) => t.map((x, j) => (j === i ? v : x)));

  if (saved) return <SavedScreen m={saved} />;
  return (
    <form onSubmit={save}>
      <BackLink to="/meds" label="All medications" />
      {!existing && <AddModeSwitch mode="type" />}
      <h1>{existing ? "Edit medication" : "Add medication"}</h1>
      {!existing && pf.name && <div className="banner" role="status">Filled in from your scan. Check each field before saving.</div>}
      <p className="sub">Only the name is used to look up trusted information. Everything else stays on this device.</p>

      <label className="field">Name<input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Lisinopril, Advil, Vitamin D" autoCapitalize="words" /></label>
      <div className="chips" role="group" aria-label="Type" style={{ marginBottom: 14 }}>
        {(Object.keys(KIND_LABEL) as MedKind[]).map((k) => <button type="button" key={k} className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>)}
      </div>
      <div className="grid2 keep"><label className="field">Strength<input value={strength} onChange={(e) => setStrength(e.target.value)} placeholder="10 mg" /></label>
        <label className="field">Form<input value={form} onChange={(e) => setForm(e.target.value)} placeholder="tablet, injection…" /></label></div>
      <label className="field">Why do you take it? <span className="hint">(optional)</span><input value={indication} onChange={(e) => setIndication(e.target.value)} placeholder="e.g. blood pressure" /></label>

      <h2>Schedule</h2>
      <div className="chips" role="group" aria-label="How often" style={{ marginBottom: 14 }}>
        {([["daily", "Every day"], ["weekdays", "Certain days"], ["interval", "Every few days"], ["prn", "As needed"]] as [Freq, string][]).map(([k, l]) => <button type="button" key={k} className="chip" aria-pressed={freq === k} onClick={() => setFreq(k)}>{l}</button>)}
      </div>
      {freq === "weekdays" && <div className="chips" role="group" aria-label="Days" style={{ marginBottom: 14 }}>{DAYS.map((d, i) => <button type="button" key={i} className="chip" aria-label={["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][i]} aria-pressed={days.includes(i)} onClick={() => setDays((x) => (x.includes(i) ? x.filter((y) => y !== i) : [...x, i]))}>{d}</button>)}</div>}
      {freq === "interval" && <label className="field">Every how many days?<input type="number" min={2} max={365} value={every} onChange={(e) => setEvery(Number(e.target.value))} /></label>}
      {freq !== "prn" && (
        <div className="field"><div style={{ fontWeight: 600, fontSize: "0.85rem" }}>Reminder times</div>
          {times.map((t, i) => <div className="row" key={i} style={{ marginTop: 6 }}><input type="time" value={t} onChange={(e) => setTime(i, e.target.value)} aria-label={`Time ${i + 1}`} style={{ marginTop: 0 }} />{times.length > 1 && <button type="button" className="btn danger small" onClick={() => setTimes(times.filter((_, j) => j !== i))}>Remove</button>}</div>)}
          <button type="button" className="btn ghost small" style={{ marginTop: 8 }} onClick={() => setTimes([...times, "12:00"])}>+ Add a time</button></div>
      )}
      <div className="grid2 keep"><label className="field">Start date<input type="date" value={start} onChange={(e) => setStart(e.target.value)} required /></label>
        <label className="field">End date <span className="hint">(optional)</span><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label></div>

      <h2>Prescriber &amp; pharmacy</h2>
      <div className="grid2"><label className="field">Doctor / prescriber<input value={doctor} onChange={(e) => setDoctor(e.target.value)} placeholder="Dr. Lopez" /></label>
        <label className="field">Doctor's office phone<input type="tel" value={doctorPhone} onChange={(e) => setDoctorPhone(e.target.value)} placeholder="(555) 123-4567" /></label></div>
      <label className="field">Pharmacy<select value={pharmacyId} onChange={(e) => setPharmacyId(e.target.value)}><option value="">None selected</option>{pharmacies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        {pharmacies.length === 0 && !pf.pharmacy?.name && <span className="hint"> <Link to="/pharmacies">Add a pharmacy first</Link></span>}</label>
      {pf.pharmacy?.name && !matchedPharm && !pharmacyId && (
        <button type="button" className="btn ghost small" style={{ marginBottom: 14 }} onClick={async () => { const ph = { id: uid(), name: pf.pharmacy!.name!, phone: pf.pharmacy!.phone }; await savePharmacy(ph); setPharmacyId(ph.id); }}>Add {pf.pharmacy.name} to my pharmacies</button>)}

      <h2>Supply &amp; refills</h2>
      <div className="grid2 keep"><label className="field">Pills on hand<input type="number" min={0} value={onHand} onChange={(e) => setOnHand(e.target.value)} /></label>
        <label className="field">Pills per dose<input type="number" min={0.25} step={0.25} value={perDose} onChange={(e) => setPerDose(e.target.value)} /></label></div>
      <div className="grid2 keep"><label className="field">Refills left<input type="number" min={0} value={refills} onChange={(e) => setRefills(e.target.value)} /></label>
        <label className="field">Expiration date<input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></label></div>

      <label className="field">How to take / give it <span className="hint">(e.g. injection site rotation)</span><textarea value={admin} onChange={(e) => setAdmin(e.target.value)} /></label>
      <label className="field">Notes<textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      <div className="row"><button className="btn" disabled={!name.trim() || (freq !== "prn" && times.length === 0)}>Save</button><button type="button" className="btn ghost" onClick={() => nav(existing ? `/meds/${existing.id}` : "/meds")}>Cancel</button></div>
    </form>
  );
}

/** Shown right after a new medicine is saved. Education is only fetched-and-shown when the person asks for it. */
function SavedScreen({ m }: { m: Medication }) {
  const { meds, bundles, interactions, refreshEducation } = useApp();
  const [checking, setChecking] = useState(true);
  const others = meds.filter((x) => !x.archived && x.id !== m.id);
  useEffect(() => { let live = true; refreshEducation(m).finally(() => live && setChecking(false)); return () => { live = false; }; }, [m.id]);
  const flags = interactions.filter((f) => f.a === m.id || f.b === m.id);
  const nameOf = (i: string) => meds.find((x) => x.id === i)?.name ?? "another medicine";
  const noLabel = !checking && !bundles.has(m.id);
  const unchecked = !checking ? others.filter((o) => !bundles.has(o.id)) : [];
  return (
    <>
      <h1>{m.name} added</h1>
      <p className="sub">It's saved on this device.</p>
      {others.length > 0 && checking && <p role="status" className="muted">Checking for interactions with your other medicines…</p>}
      {flags.length > 0 && (
        <div className="card alert red" role="alert">
          <strong>Interaction{flags.length > 1 ? "s" : ""} listed on the FDA label</strong>
          {flags.map((f, i) => (
            <p key={i} className="small" style={{ margin: "10px 0 0" }}>
              <strong>{f.a === m.id ? `${m.name}'s` : `${nameOf(f.a)}'s`} FDA label {f.strong ? "says to avoid or not combine with" : "warns about"} {f.a === m.id ? nameOf(f.b) : m.name}:</strong> “{f.sentence}”<Cite ids={[f.sourceId]} bundleKey={f.bundleKey} />
            </p>
          ))}
          <p className="small" style={{ margin: "12px 0 0" }}>Talk to your pharmacist or doctor before taking these together. Don't stop either one on your own.</p>
        </div>
      )}
      {!checking && others.length > 0 && flags.length === 0 && !noLabel && (
        <div className="card"><strong>No interactions listed on the labels</strong><p className="muted small" style={{ margin: "4px 0 0" }}>We compared the FDA label text for this and your other medicines. Labels don't name every interaction, so ask your pharmacist if you're unsure.</p></div>
      )}
      {noLabel && others.length > 0 && <div className="card alert"><strong>We couldn't check this one automatically</strong><p className="small" style={{ margin: "4px 0 0" }}>No FDA label was found for "{m.name}" (or the sources were unreachable), so interactions weren't checked. Ask your pharmacist.</p></div>}
      {unchecked.length > 0 && <p className="muted small">Not yet checked against: {unchecked.map((o) => o.name).join(", ")} (their label data isn't loaded yet).</p>}
      <div className="stack" style={{ marginTop: 18 }}>
        <Link className="btn block" to={`/meds/${m.id}/learn`}>Get AI education about {m.name}</Link>
        <Link className="btn ghost block" to="/meds">Go to my medications</Link>
      </div>
    </>
  );
}

/** AI education lives on its own page and is only loaded when someone opens it. */
export function MedLearn() {
  const { id } = useParams(); const { meds } = useApp();
  const m = meds.find((x) => x.id === id);
  if (!m) return <div className="empty">Medication not found. <Link to="/meds">Back to my medications</Link></div>;
  return (
    <>
      <BackLink to="/meds" label="All medications" />
      <h1>About {m.name}</h1>
      <p className="sub">Plain-language information from FDA, NIH and PubMed. Nothing else is used.</p>
      <EducationView med={m} />
      <div className="actions"><Link className="btn ghost small" to={`/meds/${m.id}`}>Medication details</Link></div>
    </>
  );
}

export function MedDetail() {
  const { id } = useParams(); const nav = useNavigate();
  const { meds, saveMed, removeMed, pharmacies, today, interactions } = useApp();
  const m = meds.find((x) => x.id === id);
  if (!m) return <div className="empty">Medication not found. <Link to="/meds">Back to list</Link></div>;
  const ph = pharmacies.find((p) => p.id === m.pharmacyId);
  const s = supplyStatus(m, today);
  const flags = interactions.filter((f) => f.a === m.id || f.b === m.id);
  const nameOf = (i: string) => meds.find((x) => x.id === i)?.name ?? "another medicine";
  return (
    <>
      <BackLink to="/meds" label="All medications" />
      <div className="row between top"><div><h1>{m.name}</h1><p className="sub" style={{ marginBottom: 6 }}>{[m.strength, m.form, KIND_LABEL[m.kind]].filter(Boolean).join(" · ")}</p></div></div>
      <div className="actions" style={{ marginTop: 0, marginBottom: 14 }}>
        <Link to={`/meds/${m.id}/learn`} className="btn small">AI education</Link>
        <Link to={`/meds/${m.id}/edit`} className="btn ghost small">Edit</Link>
        <DeleteButton what={m.name} confirmText={`Delete ${m.name} and its dose history from this device? This can't be undone.`} onConfirm={async () => { await removeMed(m.id); nav("/meds"); }} />
      </div>
      <div className="card stack">
        <div><span className="muted small">Schedule</span><br />{describeSchedule(m)}</div>
        {m.indication && <div><span className="muted small">Why you take it</span><br />{m.indication}</div>}
        {m.prescriber?.name && <div><span className="muted small">Prescriber</span><br />{m.prescriber.name}{m.prescriber.phone && <> · <a href={`tel:${m.prescriber.phone}`}>{m.prescriber.phone}</a></>}</div>}
        {ph && <div><span className="muted small">Pharmacy</span><br />{ph.name}{ph.phone && <> · <a href={`tel:${ph.phone}`}>{ph.phone}</a></>}</div>}
        {m.supply && <div><span className="muted small">Supply</span><br />{m.supply.onHand != null && `${m.supply.onHand} on hand${s.daysLeft != null ? ` (about ${s.daysLeft} days)` : ""}`}{m.supply.refillsLeft != null && ` · ${m.supply.refillsLeft} refills left`}{m.supply.expires && ` · expires ${m.supply.expires}`}</div>}
        {m.administration && <div><span className="muted small">How to take / give it</span><br />{m.administration}</div>}
        {m.notes && <div><span className="muted small">Notes</span><br />{m.notes}</div>}
      </div>
      {flags.length > 0 && <div className="card alert red" role="alert"><strong>Interaction listed on the FDA label</strong>{flags.map((f, i) => <p key={i} className="small" style={{ margin: "6px 0 0" }}>{f.a === m.id ? <>This medicine's label lists an interaction with <strong>{nameOf(f.b)}</strong>: “{f.sentence}”<Cite ids={[f.sourceId]} bundleKey={f.bundleKey} /></> : <><strong>{nameOf(f.a)}</strong>'s label lists an interaction with this medicine: “{f.sentence}”<Cite ids={[f.sourceId]} bundleKey={f.bundleKey} /></>} Ask your pharmacist or doctor before taking them together.</p>)}</div>}

      <div className="card"><strong>Want to learn about this medicine?</strong><p className="muted small" style={{ margin: "4px 0 10px" }}>Open plain-language information from FDA, NIH and PubMed, each statement with its source.</p><Link to={`/meds/${m.id}/learn`} className="btn small">Get AI education</Link></div>

      <div className="row" style={{ marginTop: 22 }}>
        <button className="btn ghost small" onClick={() => saveMed({ ...m, archived: !m.archived })}>{m.archived ? "Resume" : "Mark as stopped"}</button>
      </div>
    </>
  );
}
