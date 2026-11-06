// Test harness: runs the real server with the network replaced by canned responses (no internet needed).
import { installMock } from "../tests/fixtures/mock.js";
installMock();
await import("../server/index.js");
