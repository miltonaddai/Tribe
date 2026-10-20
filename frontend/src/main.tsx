import ReactDOM from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource-variable/unbounded";
import App from "./App";
import { migrateLegacyStorage } from "./lib/migrateStorage";
import "./index.css";
import "./site.css";

// Before React mounts: the session and character stores read localStorage on
// their first render.
migrateLegacyStorage();

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
