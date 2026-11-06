import { importBundle } from "../core/fhir.js";
import type { EhrConnector } from "./connector.js";

/**
 * Epic on FHIR (SMART on FHIR, standalone launch with PKCE) - SCAFFOLD, not yet live.
 * To finish: register a non-production app at https://fhir.epic.com, set VITE_EPIC_CLIENT_ID,
 * add the redirect URI below, and move the token exchange behind the future HIPAA-compliant backend.
 * Sandbox FHIR R4 base: https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4
 */
export const EPIC_SANDBOX_BASE = "https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4";
export const EPIC_SCOPES = "openid fhirUser launch/patient patient/Patient.read patient/MedicationRequest.read";

const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function pkcePair() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)).buffer);
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return { verifier, challenge };
}

export class EpicConnector implements EhrConnector {
  id = "epic-sandbox";
  label = "Epic on FHIR (sandbox)";
  private token?: string;
  private patient?: string;
  constructor(private clientId = (import.meta as any).env?.VITE_EPIC_CLIENT_ID ?? "", private redirectUri = `${location.origin}/ehr/callback`) {}
  isReady() { return !!this.clientId; }
  async begin() {
    const { verifier, challenge } = await pkcePair();
    sessionStorage.setItem("pkce_verifier", verifier);
    const q = new URLSearchParams({
      response_type: "code", client_id: this.clientId, redirect_uri: this.redirectUri, scope: EPIC_SCOPES,
      state: crypto.randomUUID(), aud: EPIC_SANDBOX_BASE, code_challenge: challenge, code_challenge_method: "S256",
    });
    return `https://fhir.epic.com/interconnect-fhir-oauth/oauth2/authorize?${q}`;
  }
  async fetchMedications() {
    if (!this.token || !this.patient) throw new Error("Not signed in to Epic yet");
    const r = await fetch(`${EPIC_SANDBOX_BASE}/MedicationRequest?patient=${this.patient}`, { headers: { Authorization: `Bearer ${this.token}`, Accept: "application/fhir+json" } });
    return importBundle(await r.json());
  }
}
