import type { DoseLog, Medication, Schedule } from "./types.js";
import { uid, ymd } from "./dates.js";

// HL7 FHIR R4 mapping. The app stores its own simple model; this layer is the seam for Epic on FHIR / SMART on FHIR.
// Export: patient-reported MedicationStatement + MedicationAdministration. Import: MedicationRequest | MedicationStatement.

const RXNORM = "http://www.nlm.nih.gov/research/umls/rxnorm";

export function toMedicationStatement(m: Medication) {
  const s = m.schedule;
  const timing: any = {};
  if (s.kind === "daily" || s.kind === "weekdays" || s.kind === "interval") {
    const days = s.kind === "interval" ? s.everyDays : 1;
    timing.repeat = { frequency: s.times.length, period: days, periodUnit: "d", timeOfDay: s.times.map((t) => `${t}:00`) };
    if (s.kind === "weekdays") timing.repeat.dayOfWeek = s.days.map((d) => ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][d]);
  }
  return {
    resourceType: "MedicationStatement",
    id: m.id,
    status: m.archived || (m.endDate && m.endDate < ymd(new Date())) ? "completed" : "active",
    medicationCodeableConcept: {
      text: [m.name, m.strength, m.form].filter(Boolean).join(" "),
      ...(m.rxcui ? { coding: [{ system: RXNORM, code: m.rxcui, display: m.name }] } : {}),
    },
    effectivePeriod: { start: m.startDate, ...(m.endDate ? { end: m.endDate } : {}) },
    informationSource: { display: "Patient (self-reported in SyncraMed)" },
    ...(m.indication ? { reasonCode: [{ text: m.indication }] } : {}),
    dosage: [{ text: m.strength ?? undefined, timing, asNeededBoolean: s.kind === "prn" }],
    ...(m.notes ? { note: [{ text: m.notes }] } : {}),
    category: { text: m.kind === "rx" ? "prescription" : m.kind === "otc" ? "over-the-counter" : "dietary supplement" },
  };
}

export function toMedicationAdministration(l: DoseLog, m: Medication) {
  return {
    resourceType: "MedicationAdministration",
    id: l.id.replace(/[^A-Za-z0-9\-.]/g, "-"),
    status: l.status === "taken" ? "completed" : "not-done",
    medicationCodeableConcept: { text: m.name },
    effectiveDateTime: l.at,
    ...(l.reason ? { statusReason: [{ text: l.reason }] } : {}),
  };
}

export function exportBundle(meds: Medication[], logs: DoseLog[]) {
  const byId = new Map(meds.map((m) => [m.id, m]));
  return {
    resourceType: "Bundle", type: "collection", timestamp: new Date().toISOString(),
    entry: [
      ...meds.map((m) => ({ resource: toMedicationStatement(m) })),
      ...logs.flatMap((l) => (byId.has(l.medId) ? [{ resource: toMedicationAdministration(l, byId.get(l.medId)!) }] : [])),
    ],
  };
}

const DEFAULT_TIMES: Record<number, string[]> = { 1: ["08:00"], 2: ["08:00", "20:00"], 3: ["08:00", "14:00", "20:00"], 4: ["08:00", "12:00", "16:00", "20:00"] };

function conceptName(c: any): string | undefined {
  return c?.text ?? c?.coding?.find((x: any) => x.display)?.display;
}

export function importBundle(bundle: any, today = ymd(new Date())): Medication[] {
  const entries: any[] = (bundle?.resourceType === "Bundle" ? bundle.entry ?? [] : [{ resource: bundle }]).map((e: any) => e.resource ?? e);
  const index = new Map<string, any>();
  for (const r of entries) if (r?.id) index.set(`${r.resourceType}/${r.id}`, r);
  const out: Medication[] = [];
  for (const r of entries) {
    if (!r || (r.resourceType !== "MedicationRequest" && r.resourceType !== "MedicationStatement")) continue;
    let name = conceptName(r.medicationCodeableConcept);
    let rxcui = r.medicationCodeableConcept?.coding?.find((c: any) => c.system === RXNORM)?.code;
    if (!name && r.medicationReference) {
      const ref = String(r.medicationReference.reference ?? "").replace(/^#/, "");
      const med = r.contained?.find((c: any) => c.id === ref) ?? index.get(ref) ?? index.get(`Medication/${ref}`);
      name = conceptName(med?.code) ?? r.medicationReference.display;
      rxcui = rxcui ?? med?.code?.coding?.find((c: any) => c.system === RXNORM)?.code;
    }
    if (!name) continue;
    const di = (r.dosageInstruction ?? r.dosage ?? [])[0] ?? {};
    const rep = di.timing?.repeat ?? {};
    const prn = !!di.asNeededBoolean || !!di.asNeededCodeableConcept;
    let schedule: Schedule;
    if (prn) schedule = { kind: "prn" };
    else {
      const times: string[] = rep.timeOfDay?.length ? rep.timeOfDay.map((t: string) => t.slice(0, 5)) : DEFAULT_TIMES[Math.min(4, Math.max(1, rep.frequency ?? 1))];
      const period = rep.periodUnit === "d" ? rep.period ?? 1 : 1;
      schedule = period > 1 ? { kind: "interval", everyDays: period, times } : { kind: "daily", times };
    }
    const done = ["stopped", "completed", "cancelled", "entered-in-error"].includes(r.status);
    out.push({
      id: uid(), name, rxcui, kind: "rx", schedule,
      strength: di.text ?? undefined,
      indication: conceptName(r.reasonCode?.[0]),
      startDate: (r.authoredOn ?? r.effectivePeriod?.start ?? today).slice(0, 10),
      endDate: r.effectivePeriod?.end?.slice(0, 10) ?? r.dispenseRequest?.validityPeriod?.end?.slice(0, 10),
      prescriber: r.requester?.display ? { name: r.requester.display } : undefined,
      supply: r.dispenseRequest?.numberOfRepeatsAllowed != null ? { refillsLeft: r.dispenseRequest.numberOfRepeatsAllowed } : undefined,
      notes: "Imported from FHIR",
      createdAt: new Date().toISOString(), archived: done || undefined,
    });
  }
  return out;
}
