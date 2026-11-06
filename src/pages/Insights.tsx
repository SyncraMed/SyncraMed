import React from "react";
import { Link } from "react-router-dom";
import { useApp } from "../state";
import { addDays } from "../core/dates";
import { missedVsSymptoms, rangeStats } from "../core/adherence";
import { supplyStatus } from "../core/supply";
import { Cite } from "../components/ui";

export default function Insights() {
  const { meds, doses, symptoms, today, now, interactions, bundles } = useApp();
  const active = meds.filter((m) => !m.archived);
  const wk = rangeStats(meds, doses, today, 7, now);
  const mo = rangeStats(meds, doses, today, 30, now);
  const cor = missedVsSymptoms(mo.stats, symptoms.filter((s) => s.date >= addDays(today, -30)));
  const nameOf = (id: string) => meds.find((m) => m.id === id)?.name ?? "";
  const noInfo = active.filter((m) => !bundles.has(m.id));
  const refills = active.filter((m) => supplyStatus(m, today).level !== "ok" && supplyStatus(m, today).level !== "unknown");
  const max = Math.max(1, ...wk.stats.map((s) => s.scheduled));
  return (
    <>
      <h1>Insights</h1><p className="sub">Patterns from your own logs, plus what trusted labels say about your medicines together.</p>
      {active.length === 0 && <div className="empty">Add medications and log doses to see insights.</div>}
      {active.length > 0 && (
        <>
          <div className="card">
            <div className="row between"><h3>Consistency</h3><span className="muted small">last 7 days</span></div>
            <div className="spark" aria-label="Doses taken per day, last 7 days" role="img">{wk.stats.map((s) => <i key={s.date} className={s.scheduled ? "" : "none"} style={{ height: `${s.scheduled ? Math.max(6, (Math.min(s.taken, s.scheduled) / max) * 100) : 6}%` }} title={`${s.date}: ${s.taken}/${s.scheduled}`} />)}</div>
            <div className="row between small" style={{ marginTop: 10 }}><span><strong>{wk.pct ?? "-"}{wk.pct != null && "%"}</strong> this week</span><span><strong>{mo.pct ?? "-"}{mo.pct != null && "%"}</strong> last 30 days</span></div>
          </div>

          <h2>Interactions listed on labels</h2>
          {interactions.length === 0 ? <p className="muted">None of your medicines' FDA labels list an unwanted interaction with another medicine on your list. That doesn't rule out interactions, so keep your pharmacist informed of everything you take, including supplements.</p> :
            interactions.map((f, i) => (
              <div className="card alert red" key={i}><strong>{nameOf(f.a)}</strong> label lists an interaction with <strong>{nameOf(f.b)}</strong> ({f.term})
                <p className="small" style={{ margin: "6px 0 0" }}>"{f.sentence}"<Cite ids={[f.sourceId]} bundleKey={f.bundleKey} /></p>
                <p className="small muted" style={{ margin: "6px 0 0" }}>This is what the label says in general, not a check of your situation. Ask your pharmacist.</p></div>))}
          {noInfo.length > 0 && <p className="small muted">Not yet checked (no trusted-source data loaded): {noInfo.map((m) => m.name).join(", ")}. Connect to the internet to load it.</p>}

          <h2>Missed doses &amp; symptoms</h2>
          <div className="card">{cor.missedDays + cor.okDays === 0 ? <p className="muted" style={{ margin: 0 }}>Log doses and symptoms for a couple of weeks to see this.</p> : <>
            <p style={{ margin: 0 }}>On days with a missed or skipped dose, you logged symptoms (that day or the next) on <strong>{cor.missedWithSym} of {cor.missedDays}</strong>. On days with every dose taken: <strong>{cor.okWithSym} of {cor.okDays}</strong>.</p>
            <p className="small muted" style={{ marginBottom: 0 }}>Small counts can't show cause and effect. It's something worth mentioning to your doctor.</p></>}</div>

          {refills.length > 0 && <><h2>Refills</h2>{refills.map((m) => <Link className="card alert" style={{ display: "block", textDecoration: "none" }} key={m.id} to="/pharmacies"><strong>{m.name}</strong>: about {supplyStatus(m, today).daysLeft} days left</Link>)}</>}
        </>
      )}
      <p><Link className="btn ghost" to="/summary">Make a summary for my doctor</Link></p>
    </>
  );
}
