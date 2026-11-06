import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import app from "./app.js";

const PORT = Number(process.env.PORT ?? 8787);
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get("*", (_q, r) => r.sendFile(path.join(dist, "index.html")));
}
app.listen(PORT, () => console.log(`SyncraMed on :${PORT}`));
