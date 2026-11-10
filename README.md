# SyncraMed

Medication management with education drawn **only** from trusted public sources.

## Run it
```
npm install
cp .env.example .env         # optional: add ANTHROPIC_API_KEY for plain-language rewriting
npm run build && npm start   # app + API on http://localhost:8787
# or: npm run dev            # Vite on :5173 with the API on :8787
npm test                     # unit tests (sources are mocked)
npm run verify:sources       # needs internet: checks live FDA / NLM / NIH / PubMed responses
```

## Architecture
- `src/` React + TypeScript PWA. All user data lives in IndexedDB on the device (`src/core/db.ts`).
- `src/core/` framework-free logic (schedules, refills, interactions, FHIR, adherence). Reusable in Capacitor / React Native / watch companions.
- `server/` small Express API. `trusted.ts` is the **allowlist**: every outbound request goes through `guardedFetch`, which refuses any other host (tested).
- `server/education.ts` builds a cited bundle: openFDA label, MedlinePlus, NIH ODS (supplements), PubMed abstracts. RxNorm is used only to match names.
- `server/validate.ts` checks any AI-written sentence: it must cite real passages, every number must appear in them, and wording must match. Failures fall back to verbatim excerpts.
- `shared/safety.ts` separates educational / actionable / emergency questions.
- `src/ehr/` FHIR seam: `core/fhir.ts` exports/imports FHIR R4 now; `ehr/epic.ts` is a SMART-on-FHIR scaffold (not live).

## Scanning a bottle
`/meds/scan` reads a photo of a label **on the device** (tesseract.js, served from `public/ocr`, copied by `scripts/copy-ocr.mjs`), then `src/scan/parse.ts` pulls out name, strength, form, directions, quantity, refills, dates, prescriber and pharmacy. The patient name is never read into a field. Only candidate medicine names (`/api/resolve`, RxNorm) or barcode digits (`/api/ndc`, openFDA) leave the device. Results prefill the normal Add form; nothing is saved until the user confirms. A scan looks for five things only: medicine + strength, directions, quantity, refills left and prescriber (`essentials()` in `parse.ts`); pharmacy, Rx number, dates and the patient are ignored. Words the OCR engine is unsure of are dropped, letter/digit mix-ups (O/0, l/1) are repaired, and a name is only accepted once RxNorm confirms it is a real medicine (partial words like "Lisinop" become "Lisinopril"). The camera takes **one still picture** (the sharpest of six frames, `grabSharpest` in `src/scan/capture.ts`), then `src/scan/flatten.ts` flattens it: it straightens the text lines (deskew) and removes shadows and glare with a local threshold, giving black text on a white page, which is read once. If that finds no medicine name, the unflattened picture is read too and the text combined. Photos taken or chosen from the gallery go through the same flatten step. Barcodes are checked when the browser has `BarcodeDetector`. (`src/scan/live.ts`, the old frame-by-frame reader, is no longer used by the app.)

## Deploying on Vercel
`vercel.json` and `api/index.ts` run the same Express API as a Vercel serverless function; the built app (`dist/`) is served as static files.
1. Push the project to GitHub and import it in Vercel (framework preset: Other; the build command and output folder come from `vercel.json`).
2. Optional environment variables (Project Settings): `ANTHROPIC_API_KEY`, `OPENFDA_API_KEY`, `NCBI_API_KEY`.
3. Use one stable address (production domain or custom domain): the app's data is stored in the browser per address, so preview URLs each start empty.
Notes: the education lookup has a 30 second function limit (`maxDuration` in `vercel.json`; lower it if your plan allows less). The 12-hour lookup cache is in memory, so on serverless it resets often. The same server also runs anywhere with `npm run build && npm start`. For the phone apps, set `VITE_API_URL` to your Vercel address before `npm run cap:sync`.

## Phone app (iOS and Android) with Capacitor
The same web app runs inside a native shell, so one codebase is both the website and the phone app (`capacitor.config.ts`, `android/`, `ios/`).
1. Host the server (`npm run build && npm start`) somewhere with HTTPS (Render, Railway, Fly.io...). The phone app needs it for education and name matching.
2. Build the app pointing at it: `set VITE_API_URL=https://your-server.example.com` (Windows cmd) or `export VITE_API_URL=...` (Mac/Linux), then:
   - Android (Windows/Mac/Linux, needs Android Studio): `npm run cap:android`, then Run in Android Studio.
   - iPhone (needs a Mac with Xcode; Windows can't build iOS): `npm run cap:ios`, then Run in Xcode (a free Apple ID works for your own phone; TestFlight/App Store needs the $99/yr developer account).
3. After any change to the web code, run `npm run cap:sync` again.
What the phone app adds: dose reminders scheduled with the phone (they fire when the app is closed), camera access for scanning, and a home-screen app. Data still lives only on the device. The generated app uses the default Capacitor icon and splash until you supply the logo (`npx @capacitor/assets generate`).

## Known limits
- The Vercel deployment has not been tried on Vercel itself (the compiled function was run locally as plain Node ESM).
- The phone builds have not been compiled or run on a device from the build environment (it has no Xcode or Android SDK); the web app, tests and `cap sync` were verified.
- OCR accuracy depends on the photo (curved, glossy or dim labels fail more often); the review step exists for that reason. Barcodes only match products in openFDA.
- Live APIs were not reachable from the build sandbox; the pipeline is tested against fixtures. Run `npm run verify:sources` first.
- MedlinePlus Connect's JSON shape and NIH ODS page layout are parsed defensively but unverified against live responses.
- On the web, reminders fire only while the app is open/running. In the phone app they are scheduled with the phone (next 7 days, rescheduled whenever the app opens or a medication changes), so open the app at least weekly.
- Not HIPAA-compliant. The passcode is a screen lock, not encryption.
