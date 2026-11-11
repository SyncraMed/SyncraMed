import React, { useState } from "react";
import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/ui";
import { useApp } from "./state";
import { checkPin, hasPin } from "./core/lock";
import Today from "./pages/Today";
import Scan from "./pages/Scan";
import { MedList, MedForm, MedDetail, MedLearn } from "./pages/Meds";
import CalendarPage from "./pages/Calendar";
import Journal from "./pages/Journal";
import Insights from "./pages/Insights";
import { Ask } from "./pages/Ask";
import { More, Pharmacies, Summary, SourcesPage, SourceReader, SettingsPage, PrivacyPage } from "./pages/More";

function Lock({ onOpen }: { onOpen: () => void }) {
  const [pin, setPin] = useState(""); const [bad, setBad] = useState(false);
  return (
    <div className="lock"><form onSubmit={async (e) => { e.preventDefault(); if (await checkPin(pin)) onOpen(); else { setBad(true); setPin(""); } }}>
      <h1>SyncraMed</h1><p className="sub">Enter your passcode</p>
      <input type="password" inputMode="numeric" autoFocus aria-label="Passcode" value={pin} onChange={(e) => setPin(e.target.value)} />
      {bad && <p role="alert">Incorrect passcode.</p>}
      <button className="btn block" style={{ marginTop: 12 }}>Unlock</button>
    </form></div>
  );
}

export default function App() {
  const { ready } = useApp();
  const [unlocked, setUnlocked] = useState(!hasPin());
  if (!unlocked) return <Lock onOpen={() => setUnlocked(true)} />;
  if (!ready) return <div className="empty" aria-busy="true">Loading…</div>;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Today />} />
        <Route path="meds" element={<MedList />} />
        <Route path="meds/new" element={<MedForm />} />
        <Route path="meds/scan" element={<Scan />} />
        <Route path="meds/:id" element={<MedDetail />} />
        <Route path="meds/:id/edit" element={<MedForm />} />
        <Route path="meds/:id/learn" element={<MedLearn />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="journal" element={<Journal />} />
        <Route path="insights" element={<Insights />} />
        <Route path="more" element={<More />} />
        <Route path="ask" element={<Ask />} />
        <Route path="pharmacies" element={<Pharmacies />} />
        <Route path="summary" element={<Summary />} />
        <Route path="sources" element={<SourcesPage />} />
        <Route path="source/:key/:id" element={<SourceReader />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="privacy" element={<PrivacyPage />} />
        <Route path="*" element={<div className="empty">Page not found.</div>} />
      </Route>
    </Routes>
  );
}
