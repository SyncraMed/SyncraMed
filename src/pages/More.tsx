import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useApp, uid } from "../state";
import { BackLink, DeleteButton } from "../components/ui";
import { cachedEducation, eduKey } from "../core/education-client";
import type { SourcePassage } from "../../shared/education";
import { TRUSTED_SOURCES } from "../../shared/sources";
import { exportBundle, importBundle } from "../core/fhir";
import { supplyStatus } from "../core/supply";
import { rangeStats } from "../core/adherence";
import { addDays, ymd } from "../core/dates";
import { describeSchedule } from "../core/schedule";
import { clearPin, hasPin, setPin } from "../core/lock";
import { requestNotify, notifySupported } from "../core/notify";
import { EpicConnector } from "../ehr/epic";
import { DISCLAIMER } from "../components/ui";

const download = (name: string, data: unknown, type = "application/json") => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([typeof data === "string" ? data : JSON.stringify(data, null, 2)], { type }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

export function More() {
  const items: [string, string, string][] = [
    ["/ask", "Ask SyncraMed", "Ask any medicine or health question, answered from trusted sources"],
    ["/pharmacies", "Pharmacies & refills", "Supply, refill alerts, call your pharmacy"],
    ["/summary", "Summary for my doctor", "Printable medication list and history"],
    ["/sources", "Where information comes from", "The only sources SyncraMed uses"],
    ["/privacy", "Privacy", "What stays on your device and what doesn't"],
    ["/settings", "Settings & data", "Text size, reminders, passcode, import and export"],
  ];
  return (<><h1>More</h1><p className="sub">&nbsp;</p><div className="card">{items.map(([to, t, d]) => <Link key={to} to={to} className="linkrow"><span><strong>{t}</strong><br /><span className="muted small">{d}</span></span><span aria-hidden>›</span></Link>)}</div></>);
}

export function Pharmacies() {
  const { pharmacies, savePharmacy, removePharmacy, meds, today } = useApp();
  const [edit, setEdit] = useState<null | { id: string; name: string; phone: string; address: string; primary: boolean }>(null);
  const [copied, setCopied] = useState("");
  const active = meds.filter((m) => !m.archived && m.kind !== "supplement");
  const rows = active.map((m) => ({ m, s: supplyStatus(m, today) })).sort((a, b) => (a.s.daysLeft ?? 999) - (b.s.daysLeft ?? 999));
  const pharmOf = (id?: string) => pharmacies.find((p) => p.id === id) ?? pharmacies.find((p) => p.primary);
  const request = (m: (typeof active)[number]) => {
    const text = `Hello, I'd like to request a refill for ${m.name}${m.strength ? " " + m.strength : ""}.${m.prescriber?.name ? ` Prescriber: ${m.prescriber.name}.` : ""} Thank you.`;
    navigator.clipboard?.writeText(text).then(() => { setCopied(m.id); setTimeout(() => setCopied(""), 2500); });
  };
  return (
    <>
      <BackLink to="/more" label="More" />
      <h1>Pharmacies &amp; refills</h1>
      <p className="sub">Keep your pharmacy handy and see what's running low.</p>
      <h2 style={{ marginTop: 0 }}>Refills</h2>
      {rows.length === 0 && <p className="muted">Add prescriptions with pill counts to track refills.</p>}
      {rows.map(({ m, s }) => { const p = pharmOf(m.pharmacyId); return (
        <div className={`card ${s.level === "soon" || s.level === "now" ? "alert" : ""}`} key={m.id}>
          <div className="row between top"><div><strong>{m.name}</strong> <span className="muted">{m.strength}</span><br /><span className="small muted">{s.daysLeft != null ? `About ${s.daysLeft} day${s.daysLeft === 1 ? "" : "s"} left` : "Supply not tracked"}{m.supply?.refillsLeft != null ? ` · ${m.supply.refillsLeft} refills left` : ""}{s.expiry === "soon" ? ` · expires in ${s.expiresInDays} days` : s.expiry === "expired" ? " · expired" : ""}</span></div>
            {(s.level === "soon" || s.level === "now") && <span className="badge solid">Refill</span>}</div>
          <div className="row" style={{ marginTop: 10, flexWrap: "wrap" }}>
            {p?.phone && <a className="btn small" href={`tel:${p.phone}`}>Call {p.name}</a>}
            <button className="btn ghost small" onClick={() => request(m)}>{copied === m.id ? "Copied" : "Copy refill request"}</button>
          </div>
        </div>); })}
      <p className="small muted">Live refill requests need a pharmacy partnership. For now, SyncraMed helps you call or copy a ready-to-send message.</p>

      <div className="row between"><h2>Your pharmacies</h2>{!edit && <button className="btn small" onClick={() => setEdit({ id: uid(), name: "", phone: "", address: "", primary: pharmacies.length === 0 })}>Add</button>}</div>
      {edit && (
        <form className="card" onSubmit={async (e) => { e.preventDefault(); await savePharmacy({ ...edit, name: edit.name.trim() }); setEdit(null); }}>
          <label className="field">Name<input required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="e.g. CVS on Main St" /></label>
          <label className="field">Phone<input type="tel" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></label>
          <label className="field">Address <span className="hint">(optional)</span><input value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></label>
          <label className="field row"><input type="checkbox" checked={edit.primary} onChange={(e) => setEdit({ ...edit, primary: e.target.checked })} style={{ width: 22, height: 22 }} /> Primary pharmacy</label>
          <div className="row"><button className="btn">Save</button><button type="button" className="btn ghost" onClick={() => setEdit(null)}>Cancel</button></div>
        </form>
      )}
      {pharmacies.map((p) => <div className="card row between" key={p.id}><div><strong>{p.name}</strong> {p.primary && <span className="badge">Primary</span>}<br /><span className="small muted">{[p.phone, p.address].filter(Boolean).join(" · ")}</span></div>
        <div className="row"><button className="btn ghost small" onClick={() => setEdit({ id: p.id, name: p.name, phone: p.phone ?? "", address: p.address ?? "", primary: !!p.primary })}>Edit</button><DeleteButton what={p.name} label="Remove" confirmText={`Remove ${p.name} from your pharmacies?`} onConfirm={() => removePharmacy(p.id)} /></div></div>)}
    </>
  );
}

export function Summary() {
  const { meds, doses, symptoms, pharmacies, today, now, interactions } = useApp();
  const [name, setName] = useState(() => { try { return localStorage.getItem("sm_name") ?? ""; } catch { return ""; } });
  const active = meds.filter((m) => !m.archived);
  const mo = rangeStats(meds, doses, today, 30, now);
  const recent = symptoms.filter((s) => s.date >= addDays(today, -30)).sort((a, b) => b.date.localeCompare(a.date));
  const nameOf = (id: string) => meds.find((m) => m.id === id)?.name ?? "";
  return (
    <>
      <div className="noprint"><BackLink to="/more" label="More" /><h1>Summary for my doctor</h1><p className="sub">A one-page list of what you take. Print it or save as PDF.</p>
        <label className="field">Your name (appears on the printout)<input value={name} onChange={(e) => { setName(e.target.value); try { localStorage.setItem("sm_name", e.target.value); } catch { /* ignore */ } }} /></label>
        <div className="row" style={{ marginBottom: 18 }}><button className="btn" onClick={() => window.print()}>Print / save as PDF</button><button className="btn ghost" onClick={() => download("syncramed-medications-fhir.json", exportBundle(meds, doses), "application/fhir+json")}>Download FHIR file</button></div></div>
      <div className="card flat">
        <h1 style={{ fontSize: "1.3rem" }}>Medication list{name ? ` · ${name}` : ""}</h1><p className="muted small">Self-reported in SyncraMed · {new Date().toLocaleDateString()}</p>
        {active.length === 0 ? <p>No active medications.</p> : (
          <table className="t"><thead><tr><th>Medicine</th><th>Type</th><th>Schedule</th><th>For</th><th>Prescriber / pharmacy</th></tr></thead>
            <tbody>{active.map((m) => <tr key={m.id}><td><strong>{m.name}</strong><br />{m.strength} {m.form}</td><td>{{ rx: "Rx", otc: "OTC", supplement: "Supplement" }[m.kind]}</td><td>{describeSchedule(m)}</td><td>{m.indication ?? ""}</td><td>{m.prescriber?.name ?? ""}{m.pharmacyId ? <><br />{pharmacies.find((p) => p.id === m.pharmacyId)?.name}</> : null}</td></tr>)}</tbody></table>
        )}
        <h2>Last 30 days</h2><p>Doses taken as scheduled: <strong>{mo.pct != null ? `${mo.pct}%` : "no scheduled doses"}</strong>{mo.pct != null && ` (${mo.taken} of ${mo.scheduled})`}</p>
        {recent.length > 0 && <><h2>Symptoms &amp; notes</h2>{recent.map((s) => <p key={s.id} style={{ margin: "0 0 8px" }}><strong>{s.date}</strong>: {s.symptoms.join(", ")}{s.severity ? ` (${["", "mild", "moderate", "severe"][s.severity]})` : ""}{s.medIds?.length ? ` · related to ${s.medIds.map(nameOf).join(", ")}` : ""}{s.note ? `. ${s.note}` : ""}</p>)}</>}
        {interactions.length > 0 && <><h2>Questions for my pharmacist</h2>{interactions.map((f, i) => <p key={i} style={{ margin: "0 0 6px" }}>The FDA label for {nameOf(f.a)} lists an interaction with {nameOf(f.b)} ({f.term}). Is it safe for me to take both?</p>)}</>}
        <p className="small muted" style={{ marginTop: 18 }}>Patient-reported list; not verified by a clinician or pharmacy.</p>
      </div>
    </>
  );
}

const GROUPS: [string, string[]][] = [
  ["Drug facts", ["api.fda.gov", "dailymed.nlm.nih.gov", "rxnav.nlm.nih.gov", "connect.medlineplus.gov", "medlineplus.gov"]],
  ["Vitamins & supplements", ["ods.od.nih.gov", "dsldapi.od.nih.gov"]],
  ["Research papers", ["eutils.ncbi.nlm.nih.gov", "pubmed.ncbi.nlm.nih.gov", "pmc.ncbi.nlm.nih.gov"]],
  ["Population health reference", ["www.ahrq.gov", "meps.ahrq.gov", "www.flhealthcharts.gov", "www.floridahealth.gov", "www.census.gov"]],
];
export function SourcesPage() {
  const by = new Map(TRUSTED_SOURCES.map((s) => [s.host, s]));
  return (
    <>
      <BackLink to="/more" label="More" />
      <h1>Where information comes from</h1>
      <p className="sub">SyncraMed's education feature only uses the sources below. It never searches the open web, and the app's code blocks requests to any other site.</p>
      {GROUPS.map(([g, hosts]) => (
        <div key={g}><h2>{g}</h2><div className="card">{hosts.map((h) => { const s = by.get(h as any)!; return (
          <a key={h} className="linkrow" href={`https://${h}/`} target="_blank" rel="noopener noreferrer"><span><strong>{s.name}</strong><br /><span className="muted small">{h}</span></span><span aria-hidden>↗</span></a>); })}</div>
          {g === "Population health reference" && <p className="small muted">These four were suggested by our BCBS mentor. They hold population statistics (for example, how common conditions are in Florida), not facts about a specific drug, so SyncraMed lists them for reference and doesn't pull drug information from them.</p>}
        </div>
      ))}
      <p className="disclaimer">{DISCLAIMER}</p>
    </>
  );
}

/** In-app page for a citation. Shows the exact retrieved text; leaving the app is a separate, optional link. */
export function SourceReader() {
  const { key, id } = useParams(); const nav = useNavigate(); const { meds } = useApp();
  const owner = meds.find((m) => eduKey(m) === decodeURIComponent(key ?? ""));
  const learnTo = owner ? `/meds/${owner.id}/learn` : "/meds";
  const [src, setSrc] = useState<{ p?: SourcePassage; all: SourcePassage[]; missing?: boolean } | null>(null);
  useEffect(() => { cachedEducation().then((c) => { const b = c.get(decodeURIComponent(key ?? ""))?.bundle; setSrc(b ? { p: b.sources.find((s) => s.id === id), all: b.sources } : { all: [], missing: true }); }); }, [key, id]);
  if (!src) return <div className="empty" aria-busy="true">Loading…</div>;
  const p = src.p;
  if (!p) return <div className="empty">That source isn't saved on this device. <Link className="btn ghost small" to="/meds">Go to my medications</Link></div>;
  const kind = { fda_label: "FDA drug label", medlineplus: "MedlinePlus", pubmed: "Research paper (PubMed)", nih_ods: "NIH Office of Dietary Supplements" }[p.type];
  const host = new URL(p.url).hostname;
  return (
    <>
      <BackLink to={learnTo} label={learnTo === "/meds" ? "All medications" : "Back to education"} />
      <span className="badge solid">{kind}</span>
      <h1 style={{ marginTop: 10 }}>{p.title}</h1>
      <p className="sub">{p.org}{p.section ? ` · ${p.section}` : ""}</p>
      <div className="sourcebox">{p.text}</div>
      <p className="small muted">Retrieved {new Date(p.retrievedAt).toLocaleString()}.{p.meta?.pmid ? ` PMID ${p.meta.pmid}.` : ""}{p.meta?.effective ? ` Label effective ${p.meta.effective}.` : ""} Shown exactly as received, with spacing tidied.{p.type === "pubmed" ? " Abstracts only; the full paper may be behind a publisher's site." : ""}</p>
      <a className="btn ghost" href={p.url} target="_blank" rel="noopener noreferrer">Open original on {host} ↗</a>
      {src.all.length > 1 && <><h2>Other sources for this medicine</h2><div className="card">{src.all.filter((s) => s.id !== p.id).map((s) => <a key={s.id} className="linkrow" href={`/source/${encodeURIComponent(key!)}/${s.id}`} onClick={(e) => { e.preventDefault(); nav(`/source/${encodeURIComponent(key!)}/${s.id}`, { replace: true }); }}><span><strong>{s.id.slice(1)}. {s.title}</strong><br /><span className="muted small">{s.org}{s.section ? ` · ${s.section}` : ""}</span></span><span aria-hidden>›</span></a>)}</div></>}
    </>
  );
}

export function PrivacyPage() {
  return (
    <>
      <BackLink to="/more" label="More" /><h1>Privacy</h1><p className="sub">Plain-language summary of how SyncraMed handles your information.</p>
      <div className="card stack">
        <div><h3>Stays on your device</h3><p style={{ margin: 0 }}>Your medications, doses, symptoms, notes, pharmacies and settings are stored in this browser on this device. There are no accounts and no sign-in, so there is no SyncraMed database holding your health information.</p></div>
        <div><h3>What leaves your device</h3><p style={{ margin: 0 }}>Only the <strong>name</strong> of a medicine or supplement you add, so the app can look up information from FDA, NIH and PubMed. When you scan a bottle, the photo is read on your device and is never uploaded; only the medicine name it finds (or a barcode number) is sent to be matched, and the patient name on the label is ignored. It isn't linked to who you are, and it never includes doses, times, symptoms or notes. The request goes through the SyncraMed server, which doesn't keep a log of lookups.</p></div>
        <div><h3>What we don't do</h3><p style={{ margin: 0 }}>No ads, no analytics or trackers, no selling or sharing data.</p></div>
        <div><h3>Your controls</h3><p style={{ margin: 0 }}>Download everything, restore a backup, or delete everything from <Link to="/settings">Settings &amp; data</Link>. You can also add an optional passcode.</p></div>
        <div><h3>Limits you should know</h3><p style={{ margin: 0 }}>This is a student prototype, not HIPAA-regulated software. The passcode locks the screen but does not encrypt stored data. Data is lost if you clear your browser data, so export a backup. In the browser, reminders work only while the app is open or running; the phone app schedules them with your phone so they also arrive when it is closed.</p></div>
        <div><h3>Connecting a doctor's records later</h3><p style={{ margin: 0 }}>If we add Epic (FHIR) connections, you would be asked for explicit consent first, and that version would run on HIPAA-compliant hosting with encryption and a business associate agreement before any real patient data is handled.</p></div>
      </div>
    </>
  );
}

export function SettingsPage() {
  const { settings, setSettings, meds, doses, symptoms, pharmacies, importMeds, restore, wipe } = useApp();
  const [pin, setPinText] = useState(""); const [locked, setLocked] = useState(hasPin());
  const [msg, setMsg] = useState("");
  const fhirRef = useRef<HTMLInputElement>(null); const backupRef = useRef<HTMLInputElement>(null);
  const epic = (() => { try { return new EpicConnector(); } catch { return null; } })();
  const readJson = async (f: File) => JSON.parse(await f.text());
  return (
    <>
      <BackLink to="/more" label="More" /><h1>Settings &amp; data</h1><p className="sub">&nbsp;</p>
      <h2 style={{ marginTop: 0 }}>Accessibility</h2>
      <div className="card">
        <label className="field">Text size<select value={settings.textScale} onChange={(e) => setSettings({ textScale: Number(e.target.value) })}><option value={1}>Standard</option><option value={1.15}>Large</option><option value={1.3}>Larger</option><option value={1.5}>Largest</option></select></label>
        <label className="field row"><input type="checkbox" style={{ width: 22, height: 22 }} checked={settings.highContrast} onChange={(e) => setSettings({ highContrast: e.target.checked })} /> High contrast</label>
        <label className="field row" style={{ marginBottom: 0 }}><input type="checkbox" style={{ width: 22, height: 22 }} checked={settings.reduceMotion} onChange={(e) => setSettings({ reduceMotion: e.target.checked })} /> Reduce motion</label>
      </div>

      <h2>Reminders</h2>
      <div className="card"><label className="field row" style={{ marginBottom: 6 }}><input type="checkbox" style={{ width: 22, height: 22 }} checked={settings.remindersEnabled} disabled={!notifySupported()} onChange={async (e) => { if (!e.target.checked) setSettings({ remindersEnabled: false }); else if (await requestNotify()) setSettings({ remindersEnabled: true }); else setMsg("Notifications are blocked for this site in your browser settings."); }} /> Notify me when a dose is due</label>
        <p className="small muted" style={{ margin: 0 }}>Works while SyncraMed is open or running in the background. Dependable alarms with the app closed require the installed phone-app version.</p></div>

      <h2>Passcode</h2>
      <div className="card">
        {locked ? <div className="row between"><span>Passcode is on</span><button className="btn ghost small" onClick={() => { clearPin(); setLocked(false); }}>Turn off</button></div> : (
          <form className="row" onSubmit={async (e) => { e.preventDefault(); if (pin.length >= 4) { await setPin(pin); setLocked(true); setPinText(""); } }}>
            <input type="password" inputMode="numeric" placeholder="Choose 4+ digits" aria-label="New passcode" value={pin} onChange={(e) => setPinText(e.target.value)} style={{ marginTop: 0 }} /><button className="btn small" disabled={pin.length < 4}>Set</button></form>)}
        <p className="small muted" style={{ marginBottom: 0 }}>Hides the app on a shared device. It doesn't encrypt stored data.</p>
      </div>

      <h2>Your data</h2>
      <div className="card stack">
        <div className="row" style={{ flexWrap: "wrap" }}>
          <button className="btn ghost small" onClick={() => download("syncramed-backup.json", { app: "syncramed", version: 1, meds, doses, symptoms, pharmacies })}>Download backup</button>
          <button className="btn ghost small" onClick={() => backupRef.current?.click()}>Restore backup</button>
          <button className="btn ghost small" onClick={() => download("syncramed-medications-fhir.json", exportBundle(meds, doses), "application/fhir+json")}>Export FHIR (R4)</button>
        </div>
        <input ref={backupRef} type="file" accept="application/json" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { const d = await readJson(f); if (d.app !== "syncramed") throw 0; await restore(d); setMsg("Backup restored."); } catch { setMsg("That file isn't a SyncraMed backup."); } e.target.value = ""; }} />
        <p className="small muted" style={{ margin: 0 }}>Clearing your browser data removes everything here, so keep a backup.</p>
        <DeleteButton what="all my data" label="Delete all my data" confirmText="Delete ALL SyncraMed data from this device? This can't be undone." onConfirm={async () => { await wipe(); setMsg("All data deleted."); }} />
      </div>

      <h2>Connect health records</h2>
      <div className="card stack">
        <div><strong>Import a FHIR medication list</strong><p className="small muted" style={{ margin: "4px 0 8px" }}>Works today with a FHIR R4 file (a Bundle of MedicationRequest or MedicationStatement), such as a download from a patient portal or Epic's sandbox test data.</p>
          <button className="btn small" onClick={() => fhirRef.current?.click()}>Choose FHIR file</button>
          <input ref={fhirRef} type="file" accept="application/json,.json" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { const found = importBundle(await readJson(f)); const have = new Set(meds.map((m) => m.name.toLowerCase())); const fresh = found.filter((m) => !have.has(m.name.toLowerCase())); await importMeds(fresh); setMsg(`Imported ${fresh.length} medication${fresh.length === 1 ? "" : "s"}${found.length - fresh.length ? ` (${found.length - fresh.length} already in your list)` : ""}.`); } catch { setMsg("Couldn't read that file as FHIR JSON."); } e.target.value = ""; }} /></div>
        <div><strong>Epic on FHIR</strong> <span className="badge">Not connected yet</span><p className="small muted" style={{ margin: "4px 0 0" }}>The SMART on FHIR sign-in and data mapping are scaffolded in the code. Going live needs an Epic developer app registration and a HIPAA-compliant backend. {epic?.isReady() ? "A client ID is configured." : "No client ID is configured."}</p></div>
      </div>
      {msg && <div className="banner" role="status">{msg}</div>}
    </>
  );
}
