import type { Medication } from "../core/types.js";

/** Anything that can supply a patient's medication list: a FHIR file today, Epic on FHIR next, a payer API or bridge platform later. */
export interface EhrConnector {
  id: string;
  label: string;
  isReady(): boolean;
  /** Start sign-in / consent. Returns a URL to send the user to. */
  begin?(): Promise<string>;
  fetchMedications(): Promise<Medication[]>;
}
