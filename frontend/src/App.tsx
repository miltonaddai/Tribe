import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { SessionProvider } from "./state/SessionStore";
import { DevLauncher } from "./components/DevLauncher";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { DocsPage } from "./pages/DocsPage";
import { CreateCharacterPage } from "./pages/CreateCharacterPage";
import { GamePage } from "./pages/GamePage";

/**
 * Plays the page entrance on every navigation. Keyed on the path so a new page
 * mounts fresh and animates; the game is left out, because fading in a WebGL
 * canvas only delays the first frame.
 */
function RouteFrame({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div key={pathname} className={pathname === "/play" ? "route" : "route route-anim"}>
      {children}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <div className="app-shell">
          <RouteFrame>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/docs" element={<DocsPage />} />
              <Route path="/docs/:section" element={<DocsPage />} />
              <Route path="/create" element={<CreateCharacterPage />} />
              <Route path="/play" element={<GamePage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </RouteFrame>
          <DevLauncher />
        </div>
      </SessionProvider>
    </BrowserRouter>
  );
}
