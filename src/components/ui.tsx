import React, { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import type { Block, EducationBundle } from "../../shared/education";
import { classifyQuestion, ACTIONABLE_MESSAGE, EMERGENCY_MESSAGE } from "../../shared/safety";
import { answerFromSources } from "../../shared/qa";
import { loadEducation } from "../core/education-client";
import type { Medication } from "../core/types";
import { useApp } from "../state";

const I = (d: string) => (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}><path d={d} /></svg>
);
export const IconToday = I("M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z");
export const IconPill = I("M10.5 20.5 3.5 13.5a4.95 4.95 0 0 1 7-7l7 7a4.95 4.95 0 0 1-7 7zM8.5 8.5l7 7");
export const IconCal = I("M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z");
export const IconNote = I("M5 4h14v16H5zM8 9h8M8 13h8M8 17h5");
export const IconInsight = I("M4 20V10M10 20V4M16 20v-7M22 20H2");
export const IconCheck = I("M5 12.5l4.5 4.5L19 7.5");
export const IconClip = I("M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48");
export const IconMenu = I("M4 7h16M4 12h16M4 17h16");

export function Wordmark() {
  return (
    <Link to="/" className="wordmark" aria-label="SyncraMed home">
      <span className="mark">+</span><span>Syncra<b>Med</b></span>
    </Link>
  );
}

/** Always goes to the page's parent (for example, a medication page -> the medication list), no matter how the person got here. */
export function BackLink({ to, label = "Back" }: { to: string; label?: string }) {
  return <Link to={to} className="backlink">‹ {label}</Link>;
}

/** Red delete button that asks once, inline, before deleting. */
export function DeleteButton({ what, onConfirm, label = "Delete", confirmText }: { what: string; onConfirm: () => void | Promise<void>; label?: string; confirmText?: string }) {
  const [ask, setAsk] = useState(false);
  if (!ask) return <button type="button" className="btn danger small" aria-label={`${label} ${what}`} onClick={() => setAsk(true)}>{label}</button>;
  return (
    <div className="confirm" role="alert">
      <span style={{ flex: "1 1 100%" }}>{confirmText ?? `Delete ${what}? This can't be undone.`}</span>
      <button type="button" className="btn danger solid small" onClick={() => void onConfirm()}>Yes, delete</button>
      <button type="button" className="btn ghost small" onClick={() => setAsk(false)}>Cancel</button>
    </div>
  );
}

/** Scan / type switch shown on both add-medication screens so you can move either way. */
export function AddModeSwitch({ mode }: { mode: "scan" | "type" }) {
  return (
    <nav className="seg" aria-label="How to add a medication">
      <Link to="/meds/scan" replace aria-current={mode === "scan" ? "page" : undefined}>Scan a bottle</Link>
      <Link to="/meds/new" replace aria-current={mode === "type" ? "page" : undefined}>Type it in</Link>
    </nav>
  );
}

export function Layout() {
  const loc = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  const tab = (to: string, label: string, Icon: any, end = false) => (
    <NavLink to={to} end={end}><Icon />{label}</NavLink>
  );
  return (
    <>
      <header className="topbar">
        <Wordmark />
        <Link to="/more" className="btn ghost small" aria-label="More: settings, sources, privacy"><IconMenu width={18} height={18} /> More</Link>
      </header>
      <main><Outlet /></main>
      <div className="tabbar"><nav aria-label="Primary">
        {tab("/", "Today", IconToday, true)}{tab("/meds", "Meds", IconPill)}{tab("/calendar", "Calendar", IconCal)}{tab("/journal", "Journal", IconNote)}{tab("/insights", "Insights", IconInsight)}
      </nav></div>
    </>
  );
}

/** Paperclip citation: opens the source on its own in-app page (not a pop-up). */
export function Cite({ ids, bundleKey }: { ids: string[]; bundleKey: string }) {
  return <>{ids.map((id) => (
    <Link key={id} className="cite" to={`/source/${encodeURIComponent(bundleKey)}/${id}`} aria-label={`Open source ${id.slice(1)}`} title="View the source for this statement">
      <IconClip />{id.slice(1)}
    </Link>
  ))}</>;
}

export function Blocks({ blocks, bundleKey }: { blocks: Block[]; bundleKey: string }) {
  return <>{blocks.map((b, i) => <p key={i}>{b.text}<Cite ids={b.cites} bundleKey={bundleKey} /></p>)}</>;
}

/** Short key points, each with its own paperclip(s). */
export function Bullets({ blocks, bundleKey }: { blocks: Block[]; bundleKey: string }) {
  return <ul className="points">{blocks.map((b, i) => <li key={i}>{b.text}<Cite ids={b.cites} bundleKey={bundleKey} /></li>)}</ul>;
}

export const DISCLAIMER = "SyncraMed shares general reference information from trusted public sources. It is not medical advice and does not replace your doctor or pharmacist. openFDA notes its data should not be relied on to make medical decisions.";

export function EducationView({ med }: { med: Pick<Medication, "name" | "kind"> }) {
  const { refreshEducation, meds } = useApp();
  const [state, setState] = useState<{ key: string; bundle: EducationBundle; stale: boolean } | { error: string } | null>(null);
  const [tick, setTick] = useState(0);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  useEffect(() => {
    let live = true; setState(null);
    loadEducation(med, tick > 0).then((r) => { if (live) setState("bundle" in r ? r : { error: r.error }); });
    return () => { live = false; };
  }, [med.name, med.kind, tick]);
  const full = meds.find((m) => m.name === med.name && m.kind === med.kind);
  useEffect(() => { if (state && "bundle" in state && full) void refreshEducation(full); /* keep global cache warm */ }, [state && "bundle" in state ? state.bundle.fetchedAt : ""]);

  if (!state) return <div aria-busy="true" aria-label="Loading trusted sources"><div className="skeleton" style={{ width: "60%" }} /><div className="skeleton" /><div className="skeleton" /><div className="skeleton" style={{ width: "80%" }} /></div>;
  if ("error" in state) return (
    <div className="card"><p style={{ margin: 0 }}><strong>Couldn't reach the trusted sources.</strong></p><p className="muted small">{state.error} We don't show anything from other places. Check your connection and try again.</p><button className="btn small" onClick={() => setTick((t) => t + 1)}>Try again</button></div>
  );
  const { bundle, key, stale } = state;
  const allKeys = bundle.sections.map((s) => s.key);
  const isOpen = (k: string) => !closed.has(k);
  const toggle = (k: string) => setClosed((c) => { const n = new Set(c); n.has(k) ? n.delete(k) : n.add(k); return n; });
  return (
    <div className="edu">
      {(bundle.resolvedName || bundle.drugClass) && <p className="muted small" style={{ marginTop: 0 }}>{[bundle.resolvedName && `Matched to: ${bundle.resolvedName}`, bundle.genericNames[0] && bundle.kind === "drug" ? `Generic: ${bundle.genericNames[0]}` : "", bundle.brandNames.length ? `Brand: ${bundle.brandNames.slice(0, 3).join(", ")}` : "", bundle.drugClass].filter(Boolean).join(" · ")}</p>}
      <p className="small" style={{ marginTop: 0 }}>
        <span className="badge solid">{bundle.mode === "summarized" ? "Short plain-language summary, checked against sources" : "Key points quoted from the sources"}</span>{" "}
        <span className="muted">Tap a <IconClip width={11} height={11} style={{ verticalAlign: "-1px" }} /> to open the source.</span>
      </p>
      {stale && <div className="banner small">You're offline or the sources are unavailable. Showing the last saved copy from {new Date(bundle.fetchedAt).toLocaleDateString()}.</div>}
      {bundle.notices.map((n, i) => <div key={i} className="banner small">{n}</div>)}
      <div className="row" style={{ justifyContent: "flex-end", marginBottom: 4 }}>
        <button type="button" className="btn ghost small" onClick={() => setClosed(new Set())} disabled={closed.size === 0}>Expand all</button>
        <button type="button" className="btn ghost small" onClick={() => setClosed(new Set(allKeys))} disabled={closed.size === allKeys.length}>Collapse all</button>
      </div>
      {bundle.sections.map((s) => (
        <div key={s.key} className="section">
          <button type="button" className="sechead" aria-expanded={isOpen(s.key)} aria-controls={`sec-${s.key}`} onClick={() => toggle(s.key)}>
            <h2>{s.title}</h2><span className="chev" aria-hidden>›</span>
          </button>
          <div id={`sec-${s.key}`} className="secbody" hidden={!isOpen(s.key)}>
            {s.blocks.length ? <Bullets blocks={s.blocks} bundleKey={key} /> : <p className="muted">{s.missing}</p>}
            {s.full && s.full.length > 0 && (
              <details className="fulltext">
                <summary>Show the full text from the sources</summary>
                <Blocks blocks={s.full} bundleKey={key} />
              </details>
            )}
          </div>
        </div>
      ))}
      {bundle.sources.length > 0 && (
        <details className="card flat" style={{ marginTop: 18 }}>
          <summary>Sources ({bundle.sources.length})</summary>
          <div style={{ marginTop: 8 }}>{bundle.sources.map((s) => (
            <Link key={s.id} className="linkrow" to={`/source/${encodeURIComponent(key)}/${s.id}`}>
              <span><strong>{s.id.slice(1)}. {s.title}</strong><br /><span className="muted small">{s.org}{s.section ? ` · ${s.section}` : ""}</span></span><span aria-hidden>›</span>
            </Link>))}</div>
        </details>
      )}
      <p className="disclaimer">Retrieved {new Date(bundle.fetchedAt).toLocaleString()}. {DISCLAIMER}</p>
      <AskBox bundle={bundle} bundleKey={key} />
    </div>
  );
}

export function AskBox({ bundle, bundleKey }: { bundle: EducationBundle; bundleKey: string }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<null | { cat: string; blocks: Block[]; none: boolean }>(null);
  const ask = (e: React.FormEvent) => {
    e.preventDefault();
    const v = classifyQuestion(q);
    const blocks = v.category === "emergency" ? [] : answerFromSources(q, bundle);
    setRes({ cat: v.category, blocks, none: !blocks.length });
  };
  return (
    <div className="card" style={{ marginTop: 18 }}>
      <h3>Ask about this medicine</h3>
      <p className="muted small" style={{ marginTop: 0 }}>Answers are pulled word-for-word from the sources above. Questions about what <em>you</em> should do go to your doctor or pharmacist.</p>
      <form onSubmit={ask} className="row"><input aria-label="Your question" placeholder="e.g. What are common side effects?" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginTop: 0 }} /><button className="btn" disabled={q.trim().length < 3}>Ask</button></form>
      {res && (
        <div style={{ marginTop: 14 }} role="status">
          {res.cat === "emergency" && <div className="banner"><strong>{EMERGENCY_MESSAGE}</strong></div>}
          {res.cat === "actionable" && <div className="banner">{ACTIONABLE_MESSAGE}</div>}
          {res.blocks.length > 0 && <Blocks blocks={res.blocks} bundleKey={bundleKey} />}
          {res.none && res.cat !== "emergency" && <p className="muted">The trusted sources we retrieved don't address that. Ask your pharmacist or doctor.</p>}
        </div>
      )}
    </div>
  );
}
