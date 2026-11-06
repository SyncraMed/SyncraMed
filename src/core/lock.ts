// Optional passcode screen. This is a UI lock on a shared device, NOT encryption of stored data.
const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
async function derive(pin: string, salt: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode(salt), iterations: 120000, hash: "SHA-256" }, key, 256));
}
export const hasPin = () => { try { return !!localStorage.getItem("sm_pin"); } catch { return false; } };
export async function setPin(pin: string) {
  const salt = crypto.randomUUID();
  localStorage.setItem("sm_pin", JSON.stringify({ salt, hash: await derive(pin, salt) }));
}
export async function checkPin(pin: string) {
  try { const { salt, hash } = JSON.parse(localStorage.getItem("sm_pin") ?? "{}"); return !!hash && (await derive(pin, salt)) === hash; } catch { return false; }
}
export const clearPin = () => localStorage.removeItem("sm_pin");
