import { useEffect, useRef, useState } from "react";
import {
  canPickOutput,
  listAudioOutputs,
  onAudioDevicesChange,
  playTestTone,
  type AudioOutput,
  type VoiceDiagnostic,
} from "../lib/voiceChat";

/** Above this, someone nearby is audibly talking and the button lights up. */
const TALKING = 0.06;

type PeerDiagnostic = VoiceDiagnostic & { name: string };

/** How each connection state reads to a player trying to work out why it is quiet. */
const STATE_LABEL: Record<string, string> = {
  none: "not connected",
  new: "connecting…",
  connecting: "connecting…",
  connected: "connected",
  disconnected: "dropped",
  failed: "failed",
  closed: "closed",
};

export function AudioOutputPicker({
  level,
  current,
  onPick,
  getPeers,
}: {
  /** Loudest nearby voice, 0-1. */
  level: number;
  current: string;
  onPick: (deviceId: string) => void;
  getPeers: () => PeerDiagnostic[];
}) {
  const [open, setOpen] = useState(false);
  const [outputs, setOutputs] = useState<AudioOutput[]>([]);
  const [peers, setPeers] = useState<PeerDiagnostic[]>([]);
  const [testing, setTesting] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // The HUD re-renders constantly, so depending on getPeers directly would clear
  // the interval before it ever fired.
  const getPeersRef = useRef(getPeers);
  getPeersRef.current = getPeers;

  useEffect(() => {
    if (!open) return;
    const tick = () => setPeers(getPeersRef.current());
    tick();
    const id = setInterval(tick, 400);
    return () => clearInterval(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const refresh = () => void listAudioOutputs().then(setOutputs);
    refresh();
    return onAudioDevicesChange(refresh);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // Capture, so the game canvas does not swallow the click first.
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const talking = level > TALKING;
  // Unlabelled devices mean the browser has not granted microphone permission yet.
  const unlabelled = outputs.length > 0 && outputs.every((o) => /^Speaker \d+$/.test(o.label));

  async function test() {
    setTesting(true);
    try {
      await playTestTone(current);
    } catch (error) {
      console.warn("[voice] test tone failed", error);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="audio-picker" ref={wrapRef}>
      <button
        className={`hud-btn audio ${talking ? "talking" : ""} ${open ? "open" : ""}`}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Audio output"
        aria-expanded={open}
        title={talking ? "Someone nearby is talking" : "Choose your speakers"}
      >
        <span className="audio-glow" style={{ opacity: Math.min(1, level * 2.4) }} aria-hidden />
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 9v6h4l5 4V5L8 9H4z" strokeLinejoin="round" />
          {/* Waves track how loud the nearby voice is. */}
          <path d="M16.5 8.5a5 5 0 0 1 0 7" opacity={level > 0.02 ? 1 : 0.35} />
          <path d="M19 6a8.5 8.5 0 0 1 0 12" opacity={level > 0.18 ? 1 : 0.35} />
        </svg>
      </button>

      {open && (
        <div className="audio-menu" role="dialog" aria-label="Audio output">
          <p className="audio-menu-head">Speakers</p>
          {!canPickOutput && (
            <p className="audio-menu-note">
              This browser always uses the system default. Change it in your OS sound settings.
            </p>
          )}
          {canPickOutput && outputs.length === 0 && <p className="audio-menu-note">No audio devices found.</p>}
          {canPickOutput &&
            outputs.map((device) => (
              <button
                key={device.deviceId}
                type="button"
                className={`audio-menu-row ${device.deviceId === current ? "active" : ""}`}
                onClick={() => {
                  onPick(device.deviceId);
                  setOpen(false);
                }}
              >
                <span>{device.label}</span>
                {device.deviceId === current && <b aria-hidden>✓</b>}
              </button>
            ))}
          {unlabelled && <p className="audio-menu-note">Turn voice chat on to see device names.</p>}
          <button type="button" className="audio-menu-test" onClick={() => void test()} disabled={testing}>
            {testing ? "Playing…" : "Play test tone"}
          </button>

          {peers.length > 0 && (
            <>
              <p className="audio-menu-head nearby">Nearby voices</p>
              {peers.map((peer) => (
                <div key={peer.sessionId} className={`audio-peer ${peer.state}`}>
                  <span className="audio-peer-name">{peer.name}</span>
                  <span className="audio-peer-state">
                    {/* Connected but silent is usually distance, not a fault. */}
                    {peer.state === "connected" && peer.volume < 0.05
                      ? "too far to hear"
                      : STATE_LABEL[peer.state] ?? peer.state}
                  </span>
                  <span className="audio-peer-meter" aria-hidden>
                    <i style={{ width: `${Math.round(peer.level * 100)}%` }} />
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
