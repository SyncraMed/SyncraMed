import React from "react";
import { Link } from "react-router-dom";
import { useApp } from "../state";
import { dosesForDay, doseState } from "../core/schedule";
import { fmtTime } from "../core/dates";
import { supplyStatus } from "../core/supply";
import { IconCheck } from "../components/ui";
import { requestNotify } from "../core/notify";

export default function Today() {
  const { meds, today, now, doseMap, logDose, undoDose, logPrn, doses, settings, setSettings, interactions, dueNow } = useApp();
  const active = meds.filter((m) => !m.archived);
  const list = dosesForDay(meds, today);
  const states = list.map((d) => doseState(d, doseMap, now));
  const done = states.filter((s) => s === "taken").length;
  const pct = list.length ? Math.round((done / list.length) * 100) : 0;
  const prn = active.filter((m) => m.schedule.kind === "prn");
  const lowSupply = active.filter((m) => ["now", "soon"].includes(supplyStatus(m, today).level) || ["soon", "expired"].includes(supplyStatus(m, today).expiry));
  const greet = now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening";
  const byId = new Map(meds.map((m) => [m.id, m]));

  return (
    <>
      <h1>{greet}</h1>
      <p className="sub">{now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>

      {!settings.onboarded && (
        <div className="card">
          <h3>Welcome to SyncraMed</h3>
          <p className="muted small" style={{ margin: "4px 0 10px" }}>Your medications and logs stay on this device. Only a medicine's name is sent out, to look up information from FDA, NIH and PubMed. Information here is educational, not medical advice.</p>
          <div className="row"><button className="btn small" onClick={() => setSettings({ onboarded: true })}>Got it</button><Link className="btn ghost small" to="/privacy">How privacy works</Link></div>
        </div>
      )}

      {dueNow.length > 0 && <div className="banner" role="status"><strong>{dueNow.length} dose{dueNow.length > 1 ? "s" : ""} due now:</strong> {dueNow.map((d) => byId.get(d.medId)?.name).join(", ")}</div>}

      {active.length === 0 ? (
        <div className="empty"><p><strong>No medications yet</strong></p><p>Add your first medicine or supplement to get reminders and trusted information.</p><div className="row" style={{ justifyContent: "center" }}><Link className="btn" to="/meds/scan">Scan a bottle</Link><Link className="btn ghost" to="/meds/new">Type it in</Link></div></div>
      ) : (
        <>
          <div className="card row">
            <div className="ring" style={{ ["--p" as any]: pct }}><div>{pct}%</div></div>
            <div><h3>Today</h3><p className="muted small" style={{ margin: 0 }}>{list.length ? `${done} of ${list.length} doses taken` : "Nothing scheduled today"}</p></div>
          </div>

          {!settings.remindersEnabled && (
            <div className="card flat row between"><span className="small">Get a notification when a dose is due.</span>
              <button className="btn small" onClick={async () => { if (await requestNotify()) setSettings({ remindersEnabled: true }); else alert("Notifications are blocked for this site. Enable them in your browser settings."); }}>Turn on</button></div>
          )}

          {list.length > 0 && (
            <div className="card">
              {list.map((d, i) => {
                const m = byId.get(d.medId)!; const s = states[i];
                const finished = s === "taken" || s === "skipped";
                return (
                  <div key={d.key} className={`dose ${finished ? "done" : ""}`}>
                    <div className="time">{fmtTime(d.time)}</div>
                    <div className="info"><strong><Link to={`/meds/${m.id}`} style={{ textDecoration: "none" }}>{m.name}</Link></strong>
                      <span className="muted small">{[m.strength, m.indication].filter(Boolean).join(" · ")}{s === "missed" ? " · Missed" : s === "due" ? " · Due now" : s === "skipped" ? " · Skipped" : ""}</span></div>
                    {!finished && s !== "upcoming" && <button className="btn ghost small" onClick={() => logDose(d, "skipped")}>Skip</button>}
                    <button className="check" aria-pressed={s === "taken"} aria-label={s === "taken" ? `Undo ${m.name} taken` : `Mark ${m.name} taken`} onClick={() => (finished ? undoDose(d.key) : logDose(d, "taken"))}>
                      {s === "taken" && <IconCheck />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {prn.length > 0 && (
            <>
              <h2>As needed</h2>
              <div className="card">{prn.map((m) => {
                const n = doses.filter((x) => x.medId === m.id && x.date === today && x.time.startsWith("prn")).length;
                return <div key={m.id} className="dose"><div className="info"><strong><Link to={`/meds/${m.id}`} style={{ textDecoration: "none" }}>{m.name}</Link></strong><span className="muted small">{n ? `${n} taken today` : "Not taken today"}</span></div><button className="btn small" onClick={() => logPrn(m.id)}>Log a dose</button></div>;
              })}</div>
            </>
          )}

          {(lowSupply.length > 0 || interactions.length > 0) && <h2>Needs attention</h2>}
          {lowSupply.map((m) => { const s = supplyStatus(m, today); return (
            <Link key={m.id} to="/pharmacies" className="card alert" style={{ display: "block", textDecoration: "none" }}>
              <strong>{m.name}</strong><br /><span className="small">{s.level !== "ok" && s.level !== "unknown" ? `About ${s.daysLeft} day${s.daysLeft === 1 ? "" : "s"} left. Time to refill. ` : ""}{s.expiry === "soon" ? `Expires in ${s.expiresInDays} days. ` : s.expiry === "expired" ? "This supply has expired. " : ""}</span>
            </Link>); })}
          {interactions.length > 0 && <Link to="/insights" className="card alert red" style={{ display: "block", textDecoration: "none" }}><strong>{interactions.length} interaction{interactions.length > 1 ? "s" : ""} listed on your medicines' labels</strong><br /><span className="small">Review in Insights and ask your pharmacist.</span></Link>}
        </>
      )}
    </>
  );
}
