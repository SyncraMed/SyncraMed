// Read settings (API keys) from the .env file in the project folder, if there is one. Must run before app.ts is loaded.
try { (process as unknown as { loadEnvFile?: (p?: string) => void }).loadEnvFile?.(".env"); } catch { /* no .env file: fine */ }
const { default: express } = await import("express");
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const { default: app } = await import("./app.js");

const PORT = Number(process.env.PORT ?? 8787);
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get("*", (_q, r) => r.sendFile(path.join(dist, "index.html")));
}
app.listen(PORT, () => console.log(`SyncraMed on :${PORT}`));