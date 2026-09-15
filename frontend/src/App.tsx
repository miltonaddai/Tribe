import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { WalletProvider } from "./state/WalletStore";
import { DevLauncher } from "./components/DevLauncher";
import { LandingPage } from "./pages/LandingPage";
import { DocsPage } from "./pages/DocsPage";
import { CreateCharacterPage } from "./pages/CreateCharacterPage";
import { GamePage } from "./pages/GamePage";

export default function App() {
  return (
    <BrowserRouter>
      <WalletProvider>
        <div className="app-shell">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/docs" element={<DocsPage />} />
            <Route path="/docs/:section" element={<DocsPage />} />
            <Route path="/create" element={<CreateCharacterPage />} />
            <Route path="/play" element={<GamePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
            
          </Routes>
          <DevLauncher />
        </div>
      </WalletProvider>
    </BrowserRouter>
  );
}
