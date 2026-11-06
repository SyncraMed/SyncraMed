import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../state";
import { addDays, fmtTime, pad, parseYmd, ymd } from "../core/dates";
import { dayStats } from "../core/adherence";
import { dosesForDay, doseState } from "../core/schedule";

export default function CalendarPage() {
  const { meds, doses, symptoms, now, today, doseMap } = useApp();
  const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [sel, setSel] = useState(today);
  const y = month.getFullYear(), mo = month.getMonth();
  const lead = month.getDay();
  const count = new Date(y, mo + 1, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => `${y}-${pad(mo + 1)}-${pad(i + 1)}`)];
  const symDates = useMemo(() => new Set(symptoms.map((s) => s.date)), [symptoms]);
  const byId = new Map(meds.map((m) => [m.id, m]));
  const selDoses = dosesForDay(meds, sel).filter((d) => sel <= today);
  const prnLogs = doses.filter((d) => d.date === sel && d.time.startsWith("prn"));
  const selSym = symptoms.filter((s) => s.date === sel);
  return (
    <>
      <h1>Calendar</h1><p className="sub">A day-by-day record of what you took.</p>
      <div className="row between" style={{ marginBottom: 10 }}>
        <button className="btn ghost small" aria-label="Previous month" onClick={() => setMonth(new Date(y, mo - 1, 1))}>‹</button>
        <strong>{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</strong>
        <button className="btn ghost small" aria-label="Next month" onClick={() => setMonth(new Date(y, mo + 1, 1))}>›</button>
      </div>
      <div className="cal" role="grid" aria-label="Medication calendar">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div className="dow" key={i}>{d}</div>)}
        {cells.map((d, i) => {
          if (!d) return <button key={i} className="empty" tabIndex={-1} aria-hidden />;
          const st = d <= today ? dayStats(meds, doses, d, now) : null;
          const all = st && st.scheduled > 0 && st.taken >= st.scheduled;
          const some = st && st.taken > 0 && !all;
          return (
            <button key={d} className={d === today ? "today" : ""} aria-pressed={sel === d} onClick={() => setSel(d)} aria-label={`${parseYmd(d).toLocaleDateString(undefined, { month: "long", day: "numeric" })}${all ? ", all doses taken" : some ? ", some doses taken" : st && st.missed ? ", missed doses" : ""}${symDates.has(d) ? ", symptoms logged" : ""}`}>
              {Number(d.slice(8))}
              <span className="dots">{st && st.scheduled > 0 && <span className={`dot ${all ? "full" : ""}`} style={some ? { background: "linear-gradient(90deg,var(--fg) 50%,transparent 50%)" } : undefined} />}{symDates.has(d) && <span className="dot sym full" />}</span>
            </button>
          );
        })}
      </div>
      <p className="muted small">● all taken · ◐ some taken · ○ none · ▪ symptoms logged</p>

      <h2>{parseYmd(sel).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</h2>
      {selDoses.length === 0 && prnLogs.length === 0 && selSym.length === 0 && <p className="muted">{sel > today ? "Upcoming day." : "Nothing recorded."}</p>}
      {(selDoses.length > 0 || prnLogs.length > 0) && (
        <div className="card">
          {selDoses.map((d) => { const s = doseState(d, doseMap, now); const log = doseMap.get(d.key); return (
            <div className="dose" key={d.key}><div className="time">{fmtTime(d.time)}</div><div className="info"><strong>{byId.get(d.medId)?.name}</strong><span className="muted small">{s === "taken" && log ? `Taken at ${new Date(log.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : s === "skipped" ? "Skipped" : s === "missed" ? "Missed" : s}</span></div></div>); })}
          {prnLogs.map((l) => <div className="dose" key={l.id}><div className="time">As needed</div><div className="info"><strong>{byId.get(l.medId)?.name}</strong><span className="muted small">Taken at {new Date(l.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span></div></div>)}
        </div>
      )}
      {selSym.map((s) => <div className="card" key={s.id}><h3>Symptoms &amp; notes</h3><div className="chips" style={{ margin: "6px 0" }}>{s.symptoms.map((x) => <span className="badge" key={x}>{x}</span>)}</div>{s.severity && <p className="small muted" style={{ margin: 0 }}>Severity: {["", "Mild", "Moderate", "Severe"][s.severity]}</p>}{s.note && <p style={{ margin: "6px 0 0" }}>{s.note}</p>}</div>)}
      <p><Link to="/journal" className="btn ghost small">Log symptoms for this day</Link></p>
    </>
  );
}
