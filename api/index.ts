// Vercel serverless entry: every /api/* request is handled by the same Express app used by `npm start`.
import app from "../server/app.js";
export default app;
