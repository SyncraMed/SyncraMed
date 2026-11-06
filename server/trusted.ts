// The single place that decides which hosts the education pipeline may contact.
// Every outbound data request goes through guardedFetch(); anything else throws.

import dns from "node:dns";
import net from "node:net";
// "fetch failed" on the first request to a host is usually Node's dual-stack (IPv6/IPv4) connection race timing out on home networks.
try { dns.setDefaultResultOrder("ipv4first"); net.setDefaultAutoSelectFamilyAttemptTimeout?.(1500); } catch { /* older Node */ }

import { TRUSTED_SOURCES } from "../shared/sources.js";
export { TRUSTED_SOURCES };

const FETCHABLE = new Set<string>(TRUSTED_SOURCES.filter((s) => s.use === "fetch").map((s) => s.host));
const ALL = new Set<string>(TRUSTED_SOURCES.map((s) => s.host));

// Government sites often reject requests with no browser-like agent string.
const UA = "Mozilla/5.0 (compatible; SyncraMed/0.1; student capstone, educational use)";

export class UntrustedHostError extends Error {}

export function isTrustedHost(host: string): boolean { return ALL.has(host.toLowerCase()); }

export function assertFetchable(url: string): URL {
  const u = new URL(url);
  if (u.protocol !== "https:") throw new UntrustedHostError(`Blocked non-HTTPS request: ${url}`);
  if (!FETCHABLE.has(u.hostname.toLowerCase())) {
    throw new UntrustedHostError(`Blocked request to untrusted host: ${u.hostname}`);
  }
  return u;
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
let impl: Fetcher = (i, init) => fetch(i, init);
/** Tests swap the network out; production never does. */
export function setFetchImpl(f: Fetcher) { impl = f; }

export async function guardedFetch(url: string, init?: RequestInit & { timeoutMs?: number }): Promise<Response> {
  let u = assertFetchable(url);
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), init?.timeoutMs ?? 12000);
  try {
    // Follow redirects by hand so every hop is re-checked against the allowlist.
    const headers = { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", ...(init?.headers as Record<string, string> | undefined) };
    for (let hop = 0; hop < 4; hop++) {
      const res = await impl(u.toString(), { ...init, headers, signal: ctl.signal, redirect: "manual" });
      if (process.env.DEBUG_SOURCES) console.error(`[src] ${res.status} ${u.hostname}${u.pathname}`);
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) { u = assertFetchable(new URL(loc, u).toString()); continue; }
      return res;
    }
    throw new Error("Too many redirects");
  } finally { clearTimeout(t); }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Government APIs occasionally drop or time out the first request. Retry up to twice on a network error, 429 or 5xx. */
export async function getJson<T = any>(url: string): Promise<T | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await guardedFetch(url, { headers: { Accept: "application/json" }, timeoutMs: 20000 });
      if (r.ok) return (await r.json()) as T;
      if (r.status !== 429 && r.status < 500) return null;
    } catch (e) {
      if (e instanceof UntrustedHostError) throw e;
      if (process.env.DEBUG_SOURCES) { const c = (e as any).cause; console.error(`[src] error ${new URL(url).hostname}: ${(e as Error).message}${c ? ` (${c.code ?? c.name}: ${c.message ?? ""}${c.errors ? " / " + c.errors.map((x: any) => x.code).join(",") : ""})` : ""}`); }
    }
    if (attempt < 2) await sleep(process.env.VITEST ? 0 : 1000);
  }
  return null;
}
export async function getText(url: string): Promise<string | null> {
  try {
    const r = await guardedFetch(url);
    return r.ok ? await r.text() : null;
  } catch (e) {
    if (e instanceof UntrustedHostError) throw e;
    return null;
  }
}
