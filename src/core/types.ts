export type MedKind = "rx" | "otc" | "supplement";

export type Schedule =
  | { kind: "daily"; times: string[] }                       // "08:00"
  | { kind: "weekdays"; days: number[]; times: string[] }    // 0=Sun..6=Sat
  | { kind: "interval"; everyDays: number; times: string[] } // every N days from startDate
  | { kind: "prn" };                                         // as needed

export interface Medication {
  id: string;
  name: string;                 // what the user typed (brand or generic)
  rxcui?: string;               // RxNorm concept id, filled in when education resolves it (used for FHIR)
  kind: MedKind;
  strength?: string;            // "10 mg"
  form?: string;                // "tablet"
  indication?: string;          // "Why do you take it?"  -> FHIR reasonCode
  schedule: Schedule;
  startDate: string;            // YYYY-MM-DD
  endDate?: string;
  prescriber?: { name?: string; phone?: string };
  pharmacyId?: string;
  supply?: { onHand?: number; perDose?: number; refillsLeft?: number; expires?: string };
  notes?: string;
  administration?: string;      // e.g. injection site rotation notes
  createdAt: string;
  archived?: boolean;
}

export type DoseStatus = "taken" | "skipped";
export interface DoseLog {
  id: string;                   // `${medId}|${date}|${time}`  (PRN: `${medId}|${date}|prn-${n}`)
  medId: string;
  date: string;
  time: string;                 // scheduled time or "prn"
  status: DoseStatus;
  at: string;                   // ISO timestamp of the action
  reason?: string;
}

export interface SymptomEntry {
  id: string;
  date: string;
  symptoms: string[];
  severity?: 1 | 2 | 3;
  mood?: string;
  note?: string;
  medIds?: string[];            // meds the user suspects / relates it to
}

export interface Pharmacy { id: string; name: string; phone?: string; address?: string; primary?: boolean }

export interface Settings {
  textScale: number;            // 1, 1.15, 1.3, 1.5
  highContrast: boolean;
  reduceMotion: boolean;
  remindersEnabled: boolean;
  onboarded: boolean;
}
export const DEFAULT_SETTINGS: Settings = { textScale: 1, highContrast: false, reduceMotion: false, remindersEnabled: false, onboarded: false };

export interface ScheduledDose { medId: string; date: string; time: string; key: string }
