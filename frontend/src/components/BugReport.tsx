import { useEffect, useRef, useState } from "react";
import { REPORT_MAX, reportingConfigured, sendBugReport, type BugContext } from "../lib/bugReports";

/**
 * The bug form, opened from the pause menu.
 *
 * It asks for one thing - what went wrong - and gathers the rest itself. Where
 * the player was, what they were in, the GPU, the window size: all of it is
 * known already, and none of it is something a reporter would think to write
 * down. A form that asks for it gets abandoned; a form that asks one question
 * gets answered.
 */
export function BugReport({
  open,
  context,
  onClose,
}: {
  open: boolean;
  context: BugContext;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [error, setError] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setText("");
    setState("idle");
    setError("");
    // The pause menu has the focus until now, and typing is the whole point.
    const id = window.setTimeout(() => field.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function submit() {
    if (state === "sending") return;
    setState("sending");
    void sendBugReport(text, context).then((result) => {
      if (result.ok) {
        setState("sent");
        // Long enough to read, short enough not to sit in front of the game.
        window.setTimeout(onClose, 1600);
        return;
      }
      setState("failed");
      setError(result.reason);
    });
  }

  const left = REPORT_MAX - text.length;

  return (
    <div className="settings-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bug-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <div>
            <h1>Report a bug</h1>
            <p style={{ color: "#888" }}>
              Where you are, your device and your graphics card are attached automatically.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {!reportingConfigured() ? (
          <p className="bug-note bug-note-bad">
            Bug reporting is not configured for this build, so there is nowhere to send this.
          </p>
        ) : (
          <>
            <textarea
              ref={field}
              className="bug-text"
              value={text}
              maxLength={REPORT_MAX}
              placeholder="What happened, and what were you doing just before?"
              onChange={(e) => setText(e.target.value)}
              // Ctrl/Cmd+Enter sends, which is what anyone who types a lot expects.
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
              }}
            />
            <div className="bug-foot">
              <span className={left < 120 ? "bug-count low" : "bug-count"}>{left} left</span>
              <button
                className="btn btn-accent"
                type="button"
                disabled={state === "sending" || state === "sent" || !text.trim()}
                onClick={submit}
              >
                {state === "sending" ? "Sending…" : state === "sent" ? "Thank you ✓" : "Send report"}
              </button>
            </div>
            {state === "failed" && <p className="bug-note bug-note-bad">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
