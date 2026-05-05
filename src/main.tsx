import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./styles/globals.css";
import "./lib/i18n";
import { initializeDB } from "./lib/db";
import { registerAutoFlush } from "./services/sync.service";

initializeDB();
registerAutoFlush();

createRoot(document.getElementById("root")!).render(<App />);
