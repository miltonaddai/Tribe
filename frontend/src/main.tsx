import ReactDOM from "react-dom/client";
import "@fontsource-variable/science-gothic";
import App from "./App";
import { migrateLegacyStorage } from "./lib/migrateStorage";
import "./index.css";

// Before React mounts: the wallet and character stores read localStorage on
// their first render.
migrateLegacyStorage();

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
