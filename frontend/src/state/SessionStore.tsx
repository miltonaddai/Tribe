import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { clearSession, loadSession, refreshSession, type Session } from "../lib/session";

type Ctx = {
  session: Session | null;
  setSession: (s: Session | null) => void;
  /** Forgets the profile in this browser. It stays in the local database. */
  signOut: () => void;
};

const SessionCtx = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => loadSession());

  // Once per visit: re-read the profile and its simulated balance. A profile
  // the local database no longer has (it was reset) sends the player back to
  // pick a name rather than failing later at the game's door.
  useEffect(() => {
    if (!session || session.demo) return;
    void refreshSession().then((next) => setSession(next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      session,
      setSession,
      signOut: () => {
        clearSession();
        setSession(null);
      },
    }),
    [session],
  );

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionCtx);
  if (!ctx) throw new Error("SessionProvider missing");
  return ctx;
}
