import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./styles/globals.css";
import "./lib/i18n";
import { initializeDB } from "./lib/db";
import { registerAutoFlush } from "./services/sync.service";
import { migrateLegacyLedgerDB } from "./lib/db-migrate-ledger";

initializeDB();
registerAutoFlush();
migrateLegacyLedgerDB().catch(console.error);

createRoot(document.getElementById("root")!).render(<App />);
