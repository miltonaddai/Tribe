import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { NAME_MAX, PASSWORD_MIN, checkName, nameProblemText } from "@moonville/shared";
import { MoonLogo } from "../components/Header";
import {
  checkUsername,
  login,
  register,
  shorten,
  walletClaim,
  walletRegister,
  walletSignIn,
  recoverFinish,
  recoverStart,
  type Session,
} from "../lib/session";
import { loadCharacterForWallet } from "../lib/storage";
import { useSession, WalletList, walletErrorText } from "../state/SessionStore";

type Mode = "signin" | "signup";

/** A wallet that signed in but has no account yet: make one, or claim one. */
type PendingWallet = { ticket: string; address: string };
type FinishMode = "new" | "existing";

export function LoginPage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { session, setSession } = useSession();
  const [mode, setMode] = useState<Mode>(params.get("mode") === "signin" ? "signin" : "signup");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameState, setNameState] = useState<{ status: "idle" | "checking" | "ok" | "error"; reason?: string | null }>({
    status: "idle",
  });
  const nameRef = useRef(username);
  nameRef.current = username;

  // Wallet sign-in.
  const [walletOpen, setWalletOpen] = useState(false);
  const [walletBusy, setWalletBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingWallet | null>(null);
  const [finishMode, setFinishMode] = useState<FinishMode>("new");

  // Recovery: the wallet linked to an account sets it a new password.
  const [recoverOpen, setRecoverOpen] = useState(false);
  const [recovering, setRecovering] = useState<{ ticket: string; username: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [newConfirm, setNewConfirm] = useState("");

  // Already signed in: there is nothing to do here.
  useEffect(() => {
    if (session) nav(loadCharacterForWallet(session.playerId, session.chain) ? "/play" : "/create", { replace: true });
  }, [session, nav]);

  // A new username is checked as it is typed, so a taken name surfaces early.
  const choosingName = pending ? finishMode === "new" : mode === "signup";
  useEffect(() => {
    if (!choosingName) return;
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
        setNameState({ status: r.available ? "ok" : "error", reason: r.reason });
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [username, choosingName]);

  const signup = mode === "signup";
  const mismatch = signup && confirm.length > 0 && confirm !== password;
  const canSubmit =
    !busy &&
    username.trim().length > 0 &&
    password.length >= (signup ? PASSWORD_MIN : 1) &&
    (!signup || (confirm === password && nameState.status !== "error"));

  function enter(next: Session) {
    setSession(next);
    nav(loadCharacterForWallet(next.playerId, next.chain) ? "/play" : "/create", { replace: true });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      enter(signup ? await register(username.trim(), password) : await login(username.trim(), password));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function signInWithWallet(walletId: string) {
    setWalletBusy(walletId);
    setError(null);
    try {
      const result = await walletSignIn(walletId);
      if (result.kind === "session") {
        enter(result.session);
        return;
      }
      // No account for this wallet yet. Keep whatever was typed as a starting
      // point, but never carry a password across into the next step.
      setPending({ ticket: result.ticket, address: result.address });
      setWalletOpen(false);
      setFinishMode(mode === "signin" && username.trim() ? "existing" : "new");
      setPassword("");
      setConfirm("");
    } catch (err) {
      setError(walletErrorText(err instanceof Error ? err.message : "Could not sign in with that wallet."));
    } finally {
      setWalletBusy(null);
    }
  }

  const canFinish =
    !busy &&
    username.trim().length > 0 &&
    (finishMode === "new" ? nameState.status !== "error" : password.length > 0);

  async function finishWallet(e: FormEvent) {
    e.preventDefault();
    if (!pending || !canFinish) return;
    setBusy(true);
    setError(null);
    try {
      enter(
        finishMode === "new"
          ? await walletRegister(pending.ticket, username.trim())
          : await walletClaim(pending.ticket, username.trim(), password),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong. Try again.";
      setError(message);
      // An expired ticket cannot be finished; start the wallet step again.
      if (/expired/i.test(message)) setPending(null);
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setConfirm("");
  }

  async function recoverWithWallet(walletId: string) {
    setWalletBusy(walletId);
    setError(null);
    try {
      const found = await recoverStart(walletId);
      setRecovering({ ticket: found.ticket, username: found.username });
      setRecoverOpen(false);
      setNewPassword("");
      setNewConfirm("");
    } catch (err) {
      setError(walletErrorText(err instanceof Error ? err.message : "Could not start recovery."));
    } finally {
      setWalletBusy(null);
    }
  }

  const resetMismatch = newConfirm.length > 0 && newConfirm !== newPassword;
  const canReset = !busy && newPassword.length >= PASSWORD_MIN && newConfirm === newPassword;

  async function finishRecoveryForm(e: FormEvent) {
    e.preventDefault();
    if (!recovering || !canReset) return;
    setBusy(true);
    setError(null);
    try {
      enter(await recoverFinish(recovering.ticket, newPassword));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save the new password.";
      setError(message);
      // An expired recovery cannot be finished; start again from the wallet.
      if (/expired/i.test(message)) setRecovering(null);
    } finally {
      setBusy(false);
    }
  }

  function cancelRecovery() {
    setRecovering(null);
    setError(null);
    setNewPassword("");
    setNewConfirm("");
  }

  function cancelWallet() {
    setPending(null);
    setWalletOpen(false);
    setError(null);
    setPassword("");
  }

  return (
    <div className="page-scroll auth-page">
      <aside className="auth-art" aria-hidden>
        <img src="/images/cities/midtown.png" alt="" />
        <div className="auth-art-copy">
          <p className="eyebrow">Moonville</p>
          <h2 className="display-sm">A city that belongs to the people living in it.</h2>
          <p>Free to play. No wallet needed to start.</p>
        </div>
      </aside>

      <main className="auth-main">
        <Link to="/" className="nav-brand auth-brand">
          <span className="nav-logo">
            <MoonLogo />
          </span>
          Moonville
        </Link>

        {recovering ? (
          <div className="auth-card card-in">
            <h1 className="display-sm">Set a new password</h1>
            <p className="auth-sub">
              Your wallet checks out. Choose a new password for{" "}
              <span className="wallet-pill">{recovering.username}</span> and you&apos;re back in.
            </p>

            <form className="auth-form" onSubmit={(e) => void finishRecoveryForm(e)} noValidate>
              {/* Lets a password manager file the new password under the right account. */}
              <input type="text" autoComplete="username" value={recovering.username} readOnly hidden />
              <label className="field-label" htmlFor="new-password">
                New password
              </label>
              <div className="text-field">
                <input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoFocus
                />
                <button type="button" className="field-toggle" onClick={() => setShowPassword((v) => !v)}>
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <p className="field-hint">At least {PASSWORD_MIN} characters.</p>

              <label className="field-label" htmlFor="new-confirm">
                Confirm new password
              </label>
              <div className="text-field">
                <input
                  id="new-confirm"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={newConfirm}
                  onChange={(e) => setNewConfirm(e.target.value)}
                  aria-invalid={resetMismatch}
                />
              </div>
              <p className={resetMismatch ? "field-hint bad" : "field-hint"}>
                {resetMismatch ? "Passwords do not match." : "\u00a0"}
              </p>

              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}

              <button type="submit" className="btn btn-accent btn-lg btn-block" disabled={!canReset}>
                {busy ? "One moment…" : "Save password & sign in"}
              </button>
            </form>

            <p className="auth-foot">
              <button type="button" className="link-btn" onClick={cancelRecovery}>
                Back to sign in
              </button>
            </p>
          </div>
        ) : pending ? (
          <div className="auth-card card-in">
            <h1 className="display-sm">Almost there</h1>
            <p className="auth-sub">
              Wallet <span className="wallet-pill">{shorten(pending.address)}</span> isn&apos;t linked to an account
              yet. Make a new one, or add this wallet to the account you already have.
            </p>

            <div className="tabs" role="tablist" style={tabIndicator(finishMode === "new" ? 0 : 1)}>
              <button
                type="button"
                role="tab"
                aria-selected={finishMode === "new"}
                className={finishMode === "new" ? "on" : ""}
                onClick={() => {
                  setFinishMode("new");
                  setError(null);
                }}
              >
                New account
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={finishMode === "existing"}
                className={finishMode === "existing" ? "on" : ""}
                onClick={() => {
                  setFinishMode("existing");
                  setError(null);
                }}
              >
                I have an account
              </button>
            </div>

            <form className="auth-form" onSubmit={(e) => void finishWallet(e)} noValidate>
              <label className="field-label" htmlFor="wallet-username">
                {finishMode === "new" ? "Choose a username" : "Your username"}
              </label>
              <div className="text-field">
                <input
                  id="wallet-username"
                  autoComplete="username"
                  autoCapitalize="off"
                  spellCheck={false}
                  maxLength={NAME_MAX}
                  placeholder={finishMode === "new" ? "e.g. moonwalker" : "Your username"}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  aria-invalid={finishMode === "new" && nameState.status === "error"}
                />
                {finishMode === "new" && nameState.status === "checking" && <span className="field-spin" aria-hidden />}
                {finishMode === "new" && nameState.status === "ok" && <span className="field-ok">Available</span>}
              </div>
              <p className={finishMode === "new" && nameState.status === "error" ? "field-hint bad" : "field-hint"}>
                {finishMode === "new"
                  ? nameState.status === "error"
                    ? nameState.reason
                    : "Your nametag in the city. You'll sign in with this wallet - no password needed."
                  : " "}
              </p>

              <Collapse open={finishMode === "existing"}>
                <label className="field-label" htmlFor="wallet-password">
                  Password
                </label>
                <div className="text-field">
                  <input
                    id="wallet-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    disabled={finishMode !== "existing"}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="field-toggle"
                    tabIndex={finishMode === "existing" ? 0 : -1}
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                <p className="field-hint">Just this once. After this, the wallet signs you straight in.</p>
              </Collapse>

              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}

              <button type="submit" className="btn btn-accent btn-lg btn-block" disabled={!canFinish}>
                {busy ? "One moment…" : finishMode === "new" ? "Create account & play" : "Link wallet & sign in"}
              </button>
            </form>

            <p className="auth-foot">
              <button type="button" className="link-btn" onClick={cancelWallet}>
                Use a different way to sign in
              </button>
            </p>
          </div>
        ) : (
          <div className="auth-card card-in">
            {/* Keyed on the mode so the heading cross-fades rather than snapping. */}
            <div key={mode} className="swap-in">
              <h1 className="display-sm">{signup ? "Sign up" : "Welcome back"}</h1>
              <p className="auth-sub">
                {signup
                  ? "Your username is your nametag in the city. It has to be unique."
                  : "Sign in with your username and password, or your wallet."}
              </p>
            </div>

            <div className="tabs" role="tablist" style={tabIndicator(signup ? 0 : 1)}>
              <button type="button" role="tab" aria-selected={signup} className={signup ? "on" : ""} onClick={() => switchMode("signup")}>
                Create account
              </button>
              <button type="button" role="tab" aria-selected={!signup} className={!signup ? "on" : ""} onClick={() => switchMode("signin")}>
                Sign in
              </button>
            </div>

            <form className="auth-form" onSubmit={(e) => void submit(e)} noValidate>
              <label className="field-label" htmlFor="username">
                Username
              </label>
              <div className="text-field">
                <input
                  id="username"
                  autoComplete="username"
                  autoCapitalize="off"
                  spellCheck={false}
                  maxLength={NAME_MAX}
                  placeholder={signup ? "e.g. moonwalker" : "Your username"}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  aria-invalid={signup && nameState.status === "error"}
                  aria-describedby="username-hint"
                />
                {signup && nameState.status === "checking" && <span className="field-spin" aria-hidden />}
                {signup && nameState.status === "ok" && <span className="field-ok">Available</span>}
              </div>
              <p id="username-hint" className={signup && nameState.status === "error" ? "field-hint bad" : "field-hint"}>
                {signup && nameState.status === "error"
                  ? nameState.reason
                  : signup
                    ? `3-${NAME_MAX} characters: letters, numbers and underscores.`
                    : " "}
              </p>

              <label className="field-label" htmlFor="password">
                Password
              </label>
              <div className="text-field">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={signup ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-describedby="password-hint"
                />
                <button type="button" className="field-toggle" onClick={() => setShowPassword((v) => !v)}>
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <p id="password-hint" className="field-hint">
                {signup ? (
                  `At least ${PASSWORD_MIN} characters.`
                ) : (
                  <button
                    type="button"
                    className="link-btn hint-link"
                    onClick={() => {
                      setRecoverOpen(true);
                      setError(null);
                    }}
                  >
                    Forgot password? Recover your account
                  </button>
                )}
              </p>

              <Collapse open={signup}>
                <label className="field-label" htmlFor="confirm">
                  Confirm password
                </label>
                <div className="text-field">
                  <input
                    id="confirm"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={confirm}
                    disabled={!signup}
                    onChange={(e) => setConfirm(e.target.value)}
                    aria-invalid={mismatch}
                  />
                </div>
                <p className={mismatch ? "field-hint bad" : "field-hint"}>
                  {mismatch ? "Passwords do not match." : " "}
                </p>
              </Collapse>

              {error && !walletOpen && !recoverOpen && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}

              <button type="submit" className="btn btn-accent btn-lg btn-block" disabled={!canSubmit}>
                {busy ? "One moment…" : signup ? "Create account & play" : "Sign in"}
              </button>
            </form>

            <div className="auth-divider" role="separator">
              <span>or</span>
            </div>

            <button
              type="button"
              className="btn btn-ghost btn-lg btn-block wallet-signin"
              onClick={() => {
                setWalletOpen(true);
                setError(null);
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <rect x="3" y="6" width="18" height="13" rx="2.5" />
                <path d="M3 10h18M16.5 14.5h.01" strokeLinecap="round" />
              </svg>
              {signup ? "Sign up with a Solana wallet" : "Sign in with a Solana wallet"}
            </button>

            {walletOpen && (
              <WalletModal
                title={signup ? "Sign up with a wallet" : "Sign in with a wallet"}
                busy={walletBusy}
                error={error}
                onPick={(id) => void signInWithWallet(id)}
                onClose={() => {
                  setWalletOpen(false);
                  setError(null);
                }}
              />
            )}

            {recoverOpen && (
              <WalletModal
                title="Recover your account"
                lede="Connect the wallet you linked to your account and sign the message. Then choose a new password. Nothing is sent and no permission to spend is given."
                busy={walletBusy}
                error={error}
                onPick={(id) => void recoverWithWallet(id)}
                onClose={() => {
                  setRecoverOpen(false);
                  setError(null);
                }}
              />
            )}

            <p className="auth-foot">
              {signup ? "Already have an account? " : "New to Moonville? "}
              <button type="button" className="link-btn" onClick={() => switchMode(signup ? "signin" : "signup")}>
                {signup ? "Sign in" : "Create one - it's free"}
              </button>
            </p>
            <p className="auth-fine">
              Made your account with a username? Sign in with your wallet and choose &quot;I have an account&quot;
              once - after that your wallet signs you straight in, and it can recover your account if you ever
              forget your password.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

/**
 * The wallet picker for signing in, as a dialog over the form.
 *
 * Escape and a click outside close it, except while a wallet prompt is open -
 * closing then would leave the wallet asking for a signature nobody is waiting on.
 */
function WalletModal({
  title,
  lede = "Pick your wallet and sign the message it shows. It proves the wallet is yours - nothing is sent and no permission to spend is given.",
  busy,
  error,
  onPick,
  onClose,
}: {
  title: string;
  lede?: string;
  busy: string | null;
  error: string | null;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  return (
    <div className="modal-scrim" onClick={() => !busy && onClose()} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-signin-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <p className="eyebrow">Solana</p>
            <h2 id="wallet-signin-title">{title}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close" disabled={Boolean(busy)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <p className="modal-lede">{lede}</p>
        <WalletList busy={busy} onPick={onPick} />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

/** Where the sliding tab highlight sits: 0 for the left tab, 1 for the right. */
function tabIndicator(index: 0 | 1) {
  return { "--tab": index } as CSSProperties;
}

/**
 * A block that grows and shrinks with the mode instead of popping in and out.
 *
 * It stays mounted so it can animate closed; hidden content is also hidden
 * from screen readers, and its inputs are disabled by the caller so Tab never
 * lands on a field nobody can see.
 */
function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className={open ? "collapse open" : "collapse"} aria-hidden={!open}>
      <div className="collapse-inner">{children}</div>
    </div>
  );
}
