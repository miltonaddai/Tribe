import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CURRENCY, NAME_MAX, checkName, nameProblemText } from "@tribe/shared";
import { BrandLogo } from "../components/Header";
import { checkUsername, playAs } from "../lib/session";
import { loadCharacterForWallet } from "../lib/storage";
import { useSession } from "../state/SessionStore";

/**
 * Pick a name and play. The game runs as an offline sandbox, so there is no
 * sign-in: a new name makes a new profile, and an existing name picks that
 * profile back up. Use different names in different tabs to test as several
 * players at once.
 */
export function LoginPage() {
  const nav = useNavigate();
  const { session, setSession } = useSession();
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameState, setNameState] = useState<{
    status: "idle" | "checking" | "new" | "existing" | "error";
    reason?: string | null;
  }>({ status: "idle" });
  const nameRef = useRef(username);
  nameRef.current = username;

  // Already playing as someone: go straight on.
  useEffect(() => {
    if (session) nav(loadCharacterForWallet(session.playerId, session.chain) ? "/play" : "/create", { replace: true });
  }, [session, nav]);

  // Checked as it is typed, so the player knows whether this is a new profile.
  useEffect(() => {
    const trimmed = username.trim();
    if (!trimmed) {
      setNameState({ status: "idle" });
      return;
    }
    const problem = checkName(trimmed);
    if (problem) {
      setNameState({ status: "error", reason: nameProblemText(problem) });
      return;
    }
    setNameState({ status: "checking" });
    const timer = window.setTimeout(() => {
      void checkUsername(trimmed).then((r) => {
        if (trimmed !== nameRef.current.trim()) return;
        if (!r.valid) setNameState({ status: "error", reason: r.reason });
        else setNameState({ status: r.exists ? "existing" : "new" });
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [username]);

  const canSubmit = !busy && username.trim().length > 0 && nameState.status !== "error";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const { session: next, hasCharacter } = await playAs(username.trim());
      setSession(next);
      nav(hasCharacter || loadCharacterForWallet(next.playerId, next.chain) ? "/play" : "/create", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const hint =
    nameState.status === "error"
      ? nameState.reason
      : nameState.status === "existing"
        ? "A profile with this name exists on this machine - you'll pick it back up."
        : `3-${NAME_MAX} characters: letters, numbers and underscores.`;

  return (
    <div className="page-scroll auth-page">
      <aside className="auth-art" aria-hidden>
        <img src="/images/cities/midtown.png" alt="" />
        <div className="auth-art-copy">
          <p className="eyebrow">Tribe</p>
          <h2 className="display-sm">A city that belongs to the people living in it.</h2>
          <p>Offline sandbox. No sign-in, no wallet - just {CURRENCY}.</p>
        </div>
      </aside>

      <main className="auth-main">
        <Link to="/" className="nav-brand auth-brand">
          <span className="nav-logo">
            <BrandLogo />
          </span>
          Tribe
        </Link>

        <div className="auth-card card-in">
          <h1 className="display-sm">Pick a name</h1>
          <p className="auth-sub">
            Your name is your nametag in the city. Everything is stored locally by the game server on this machine.
          </p>

          <form className="auth-form" onSubmit={(e) => void submit(e)} noValidate>
            <label className="field-label" htmlFor="username">
              Name
            </label>
            <div className="text-field">
              <input
                id="username"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                maxLength={NAME_MAX}
                placeholder="e.g. streetrunner"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                aria-invalid={nameState.status === "error"}
                aria-describedby="username-hint"
                autoFocus
              />
              {nameState.status === "checking" && <span className="field-spin" aria-hidden />}
              {nameState.status === "new" && <span className="field-ok">New</span>}
              {nameState.status === "existing" && <span className="field-ok">Welcome back</span>}
            </div>
            <p id="username-hint" className={nameState.status === "error" ? "field-hint bad" : "field-hint"}>
              {hint}
            </p>

            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            <button type="submit" className="btn btn-accent btn-lg btn-block" disabled={!canSubmit}>
              {busy ? "One moment…" : nameState.status === "existing" ? "Continue" : "Play"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
