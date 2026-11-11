// Ask SyncraMed: a chat for any medicine or health-education question. Every answer comes from sources retrieved just now from the
// trusted list, and says so when it cannot find one. Nothing typed here is saved on the server; the conversation lives only on this screen.
import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useApp } from "../state";
import { apiUrl } from "../core/api";
import { ASK_DISCLAIMER, type AskResponse } from "../../shared/ask";
import { IconClip } from "../components/ui";

interface Turn { q: string; res?: AskResponse; error?: string }
const IDEAS = ["What are the common side effects of metformin?", "Can I drink alcohol while taking lisinopril?", "What does high blood pressure do to the body?", "Is vitamin D safe to take every day?"];

export function Ask() {
  const { meds } = useApp(); const [params] = useSearchParams();
  const [turns, setTurns] = useState<Turn[]>([]); const [q, setQ] = useState(params.get("q") ?? ""); const [busy, setBusy] = useState(false);
  const [useMine, setUseMine] = useState(false); const [open, setOpen] = useState<Record<string, boolean>>({});
  const end = useRef<HTMLDivElement>(null);
  const names = meds.filter((m) => !m.archived).map((m) => m.name);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns, busy]);

  const ask = async (text: string) => {
    const question = text.trim(); if (question.length < 3 || busy) return;
    setQ(""); setBusy(true); setTurns((t) => [...t, { q: question }]);
    const previous = [...turns].reverse().find((t) => t.res?.topics.length)?.res?.topics ?? [];
    try {
      const r = await fetch(apiUrl("/api/ask"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, meds: useMine ? names : [], previous }), signal: AbortSignal.timeout(70000) });
      const j = await r.json();
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? (r.ok ? { q: question, res: j as AskResponse } : { q: question, error: j?.error ?? "Something went wrong." }) : x)));
    } catch { setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { q: question, error: "We couldn't reach the server. Check your connection and try again." } : x))); }
    setBusy(false);
  };

  return (
    <>
      <h1>Ask SyncraMed</h1>
      <p className="sub">Ask about medicines, supplements, side effects or health topics. Answers come only from FDA, NIH, MedlinePlus and PubMed pages found for your question.</p>
      <div className="banner small" role="note"><strong>For education only.</strong> Not medical advice. Check with your doctor or pharmacist. In an emergency call 911.</div>

      {!turns.length && <div className="card"><strong>Try asking</strong><div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>{IDEAS.map((i) => <button key={i} className="chip" onClick={() => ask(i)}>{i}</button>)}</div></div>}

      {turns.map((t, i) => (
        <div key={i} style={{ marginBottom: 18 }}>
          <div className="card" style={{ background: "var(--accent)", color: "var(--accent-fg)", marginBottom: 8 }}>{t.q}</div>
          {t.error && <div className="card alert">{t.error}</div>}
          {!t.res && !t.error && i === turns.length - 1 && busy && <div className="card" aria-busy="true" role="status">Finding trusted sources and checking the answer…</div>}
          {t.res && <Answer res={t.res} open={open} toggle={(k) => setOpen((o) => ({ ...o, [k]: !o[k] }))} idx={i} />}
        </div>
      ))}
      <div ref={end} />

      <div className="card" style={{ position: "sticky", bottom: 92, marginTop: 8 }}>
        <form onSubmit={(e) => { e.preventDefault(); void ask(q); }} className="row">
          <input aria-label="Your question" placeholder="Ask any medicine or health question" value={q} maxLength={400} onChange={(e) => setQ(e.target.value)} style={{ marginTop: 0 }} />
          <button className="btn" disabled={busy || q.trim().length < 3}>{busy ? "…" : "Ask"}</button>
        </form>
        {names.length > 0 && <label className="small muted" style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
          <input type="checkbox" checked={useMine} onChange={(e) => setUseMine(e.target.checked)} style={{ width: "auto", margin: 0 }} />
          Include my medicine names when I ask about "my medicines" (names only are sent)</label>}
      </div>
      <p className="disclaimer">{ASK_DISCLAIMER}</p>
    </>
  );
}

function Answer({ res, open, toggle, idx }: { res: AskResponse; open: Record<string, boolean>; toggle: (k: string) => void; idx: number }) {
  const cited = new Set(res.answer.flatMap((b) => b.cites));
  const key = (id: string) => `${idx}:${id}`;
  const jump = (id: string) => { if (!open[key(id)]) toggle(key(id)); setTimeout(() => document.getElementById(`src-${idx}-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50); };
  return (
    <div className="card">
      {res.banner && <div className="banner"><strong>{res.banner}</strong></div>}
      {res.mode !== "none" && <span className="badge solid">{res.mode === "ai" ? "Plain-language answer, checked against sources" : "Word-for-word from the sources"}</span>}
      {res.answer.length > 0 && <ul className="points" style={{ marginTop: 12 }}>{res.answer.map((b, i) => <li key={i}>{b.text}{b.cites.map((c) => <button key={c} className="cite" onClick={() => jump(c)} aria-label={`Show source ${c.slice(1)}`}><IconClip />{c.slice(1)}</button>)}</li>)}</ul>}
      {res.mode === "none" && !res.banner?.startsWith("If this is an emergency") && <p><strong>No verified answer found.</strong></p>}
      {res.notices.map((n, i) => <p key={i} className="muted small">{n}</p>)}
      {res.sources.length > 0 && (
        <details style={{ marginTop: 8 }} open={cited.size > 0 ? undefined : true}>
          <summary>{cited.size ? `Sources (${res.sources.length})` : `Related reading (${res.sources.length})`}</summary>
          <div style={{ marginTop: 8 }}>{res.sources.map((s) => (
            <div key={s.id} id={`src-${idx}-${s.id}`} style={{ borderTop: "1px solid var(--line)", padding: "10px 0" }}>
              <button className="linkrow" style={{ width: "100%", textAlign: "left", background: "none", border: 0, padding: 0, cursor: "pointer", color: "inherit" }} onClick={() => toggle(key(s.id))} aria-expanded={!!open[key(s.id)]}>
                <span><strong>{s.id.slice(1)}. {s.title}</strong>{cited.has(s.id) ? " ✓" : ""}<br /><span className="muted small">{s.org}{s.section ? ` · ${s.section}` : ""}</span></span><span aria-hidden>{open[key(s.id)] ? "−" : "+"}</span>
              </button>
              {open[key(s.id)] && <><div className="sourcebox">{s.text}</div><a className="small" href={s.url} target="_blank" rel="noopener noreferrer">Open original on {new URL(s.url).hostname} ↗</a></>}
            </div>))}</div>
        </details>
      )}
      <p className="disclaimer" style={{ marginTop: 12 }}>Educational use only, not medical advice. Retrieved {new Date(res.fetchedAt).toLocaleString()}. Check with your doctor or pharmacist.</p>
    </div>
  );
}
