import type { CapacitorConfig } from "@capacitor/cli";

// The phone app is the same web app (dist/) inside a native shell.
// Education and name matching still come from the SyncraMed server: set VITE_API_URL to its HTTPS address before building.
const config: CapacitorConfig = {
  appId: "com.syncramed.app",
  appName: "SyncraMed",
  webDir: "dist",
  server: { androidScheme: "https" },
  plugins: { LocalNotifications: { iconColor: "#000000" } },
};
export default config;
