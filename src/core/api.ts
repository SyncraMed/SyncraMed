// Where the SyncraMed server lives.
//  - Web: the app and API are served together, so paths stay relative ("/api/...").
//  - Phone app: the app runs from inside the device, so the server's full HTTPS address is baked in at build time (VITE_API_URL).
const base = ((import.meta as any).env?.VITE_API_URL as string | undefined)?.replace(/\/+$/, "") ?? "";
export const apiUrl = (path: string) => `${base}${path}`;
