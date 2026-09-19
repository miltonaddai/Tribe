import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CURRENCY, CITIES, HOME_NAME_MAX, MIN_ASKING_PRICE, armSlots, gunSpec } from "@tribe/shared";
import type { GameSettings } from "@tribe/shared";
import { GameEngine, type HudState } from "../game/engine";
import { loadCharacter, loadCharacterForWallet, loadSettings } from "../lib/storage";
import { loadWallet } from "../lib/wallet";
import { SettingsModal } from "./SettingsModal";
import { WorldMap } from "../components/WorldMap";
import { InventoryPanel, itemName } from "../components/InventoryPanel";
import { FriendsTab } from "../components/FriendsTab";
import { TradePanel } from "../components/TradePanel";
import { CrimeBoard } from "../components/CrimeBoard";
import { Wardrobe } from "../components/Wardrobe";
import { ShotPreview } from "../components/ShotPreview";
import { DesktopOnly } from "../components/DesktopOnly";
import { playBlock, type Blocked } from "../lib/device";
import { MiniMap, zoneLabel } from "../components/MiniMap";
import { AudioOutputPicker } from "../components/AudioOutputPicker";
import { loadOutputDevice } from "../lib/voiceChat";
import type { ItemId } from "@tribe/shared";

const EMPTY: HudState = {
  city: "trench",
  prompt: null,
  fps: 0,
  x: 0,
  z: 0,
  block: "BLK 07 · 128, 042",
  health: 100,
  nearbyPlayer: null,
  nametags: [],
  whispers: [],
  lastWhisper: null,
  gateMessage: null,
  chat: [],
  citizens: [],
  connected: false,
  tribute: 0,
  inventory: [],
  inStore: false,
  inStation: false,
  inFashion: false,
  aiming: false,
  outfit: "hi-vis",
  inTownhall: false,
  crimeReports: [],
  gun: null,
  pet: null,
  accessories: [],
  tradeInvite: null,
  trade: null,
  voiceLevel: 0,
  nearbyVoiceLevel: 0,
  notice: null,
  listPrompt: null,
  namePrompt: null,
  carListPrompt: null,
  offerPrompt: null,
  messages: [],
  unreadMessages: 0,
  sessionEnded: null,
  ownedHomes: [],
  ownedCars: [],
  friends: [],
  friendRequests: 0,
  heading: 0,
  accessTier: 1,
  aimTarget: null,
  joinFailure: null,
  roster: [],
};

/**
 * Asks the engine to save, without ever leaving the caller hanging.
 *
 * `engine?.saveSpot()` is not enough. Optional chaining guards the engine being
 * null, not the method being absent - and absent is exactly what happens during
 * development, because the engine is constructed once in an effect while Vite's
 * HMR keeps swapping the module underneath it. The live object is then an
 * instance of the previous class, missing anything added since, and the call
 * throws after the button has already been put into its "saving" state, leaving
 * it stuck there with nothing logged.
 *
 * Reloading fixes that, but the button should say so rather than hang.
 */
function requestSave(engine: GameEngine | null): Promise<{ ok: boolean; text: string }> {
  if (!engine) return Promise.resolve({ ok: false, text: "Not connected." });
  if (typeof engine.saveSpot !== "function") {
    return Promise.resolve({ ok: false, text: "Game code is out of date — reload the page." });
  }
  try {
    return engine.saveSpot();
  } catch (err) {
    return Promise.resolve({ ok: false, text: err instanceof Error ? err.message : "Could not save." });
  }
}

/** Shown when the single world is at capacity. Retries on a timer so the
    player is queueing rather than refreshing by hand. */
function WorldFullScreen({ onRetry }: { onRetry: () => Promise<boolean> }) {
  const [seconds, setSeconds] = useState(10);
  const [attempts, setAttempts] = useState(0);
  const [trying, setTrying] = useState(false);

  useEffect(() => {
    if (trying) return;
    if (seconds <= 0) {
      setTrying(true);
      void onRetry().then((ok) => {
        if (ok) return;
        setAttempts((n) => n + 1);
        setSeconds(10);
        setTrying(false);
      });
      return;
    }
    const t = window.setTimeout(() => setSeconds((n) => n - 1), 1000);
    return () => window.clearTimeout(t);
  }, [seconds, trying, onRetry]);

  return (
    <div className="session-ended">
      <div className="session-ended-card">
        <p className="list-kicker">TRIBE IS FULL</p>
        <p className="session-ended-body">
          Every slot in the city is taken right now. You are in line and will be let in as soon as someone
          leaves.
        </p>
        <p className="queue-status">
          {trying ? "Trying now…" : `Next try in ${seconds}s`}
          {attempts > 0 && ` · ${attempts} ${attempts === 1 ? "attempt" : "attempts"} so far`}
        </p>
        <div className="list-actions">
          <button
            className="btn btn-accent"
            type="button"
            disabled={trying}
            onClick={() => setSeconds(0)}
          >
            Try now
          </button>
        </div>
      </div>
    </div>
  );
}

export function GamePage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const cityKey = params.get("city") ?? "";
  const openSettings = params.get("settings") === "1";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [hud, setHud] = useState<HudState>(EMPTY);
  const [paused, setPaused] = useState(false);
  // Reset every time the menu opens: a tick from five minutes and a hundred
  // metres ago would read as "your current spot is saved", which it is not.
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [saveNote, setSaveNote] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState("");
  const [whisperOpen, setWhisperOpen] = useState(false);
  const [whisperTarget, setWhisperTarget] = useState<{ sessionId: string; name: string } | null>(null);
  const [whisperText, setWhisperText] = useState("");
  const [tradeOpen, setTradeOpen] = useState(false);
  const [crimeOpen, setCrimeOpen] = useState(false);
  const [fitOpen, setFitOpen] = useState(false);
  const [shot, setShot] = useState<Blob | null>(null);
  const [shooting, setShooting] = useState(false);
  // Held up until the server says which district we are actually in.
  const [loading, setLoading] = useState(true);
  // Re-checked on resize so a desktop window dragged narrow recovers by being
  // widened again, rather than needing a reload.
  const [blocked, setBlocked] = useState<Blocked>(() => playBlock());
  const [invOpen, setInvOpen] = useState(false);
  const [listPrice, setListPrice] = useState("");
  const [homeName, setHomeName] = useState("");
  const [carPrice, setCarPrice] = useState("");
  const [inboxOpen, setInboxOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [inboxTab, setInboxTab] = useState<"messages" | "friends">("messages");
  const [buyError, setBuyError] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [voiceState, setVoiceState] = useState<"off" | "requesting" | "on" | "error">("off");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [audioOutput, setAudioOutput] = useState<string>(() => loadOutputDevice());
  const [settings, setSettings] = useState<GameSettings>(() => loadSettings());
  const padRef = useRef({ x: 0, z: 0 });
  const seenWhisper = useRef<string>("");
  const whisperLogRef = useRef<HTMLDivElement>(null);
  const whisperOpenRef = useRef(false);
  const mapOpenRef = useRef(false);
  const invOpenRef = useRef(false);
  const listPromptRef = useRef(false);
  const offerPromptRef = useRef(false);
  const inboxOpenRef = useRef(false);
  whisperOpenRef.current = whisperOpen;
  mapOpenRef.current = mapOpen;
  invOpenRef.current = invOpen;
  listPromptRef.current = Boolean(hud.listPrompt);
  const ownedCount = hud.ownedHomes.length + hud.ownedCars.length;
  const inboxBadge = hud.unreadMessages + hud.friendRequests;
  offerPromptRef.current = Boolean(hud.offerPrompt);
  inboxOpenRef.current = inboxOpen;

  // Any open panel hands the cursor back. With a gun out the pointer is captured
  // for aiming, and a trapped cursor cannot click Buy.
  const anyPanelOpen =
    invOpen || mapOpen || inboxOpen || chatOpen || whisperOpen || tradeOpen || settingsOpen || paused ||
    Boolean(hud.trade) || Boolean(hud.tradeInvite) || crimeOpen || fitOpen || Boolean(shot) ||
    Boolean(hud.carListPrompt) || Boolean(hud.namePrompt) || Boolean(hud.listPrompt);
  useEffect(() => {
    // Tell the engine either way: it must not grab the cursor back while a
    // panel is open, and it may resume aiming once one closes.
    engineRef.current?.setUiOpen(anyPanelOpen);
  }, [anyPanelOpen]);

  // Declared as a ref-free closure over setState only, so the key handler bound
  // once on mount still calls a working version.
  const takeShot = () => {
    const engine = engineRef.current;
    if (!engine || typeof engine.captureShot !== "function") return;
    setShooting(true);
    void engine.captureShot().then((blob) => {
      setShooting(false);
      if (blob) setShot(blob);
    });
  };

  useEffect(() => {
    const onResize = () => setBlocked(playBlock());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    // Nothing starts on a device that cannot play. Guarding here rather than
    // hiding the canvas matters: booting the engine would download and build a
    // whole 3D city on a phone that is about to be turned away.
    if (blocked) return;
    const wallet = loadWallet();
    const character = wallet ? loadCharacterForWallet(wallet.address, wallet.chain) : loadCharacter();
    if (!character) {
      nav(wallet ? "/create" : "/");
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new GameEngine();
    engineRef.current = engine;
    // start() now resolves once the authoritative spawn has been applied, so
    // the canvas stays behind the loader until the player is in the right city.
    void engine.start(canvas, character, loadSettings(), setHud).finally(() => setLoading(false));
    if (openSettings) setSettingsOpen(true);

    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");
      if (typing) return;
      if (e.key === "Enter") {
        const near = engine.nearbyTalkTarget();
        if (near) {
          setChatOpen(false);
          setWhisperTarget(near);
          setWhisperOpen(true);
        } else {
          setWhisperOpen(false);
          setChatOpen(true);
        }
      }
      if (e.key === "t" || e.key === "T") setTradeOpen(true);
      if (e.key === "i" || e.key === "I") {
        // Inside the fashion house, I is the wardrobe: it is the reason you
        // walked in, and the inventory is still reachable from the HUD button.
        if (engine.inFashionHouse()) {
          setFitOpen((open) => !open);
          return;
        }
        setInvOpen((open) => !open);
        setBuyError(null);
      }
      if (e.key === "r" || e.key === "R") setCrimeOpen((open) => !open);
      if (e.key === "p" || e.key === "P") takeShot();
      if (e.key === "m" || e.key === "M") setMapOpen((open) => !open);
      if (e.key === "n" || e.key === "N") setInboxOpen((open) => !open);
      if (e.key === "Escape") {
        if (document.pointerLockElement) return;
        if (listPromptRef.current) {
          engine.cancelListing();
          return;
        }
        if (offerPromptRef.current) {
          engine.closeOffer();
          return;
        }
        if (inboxOpenRef.current) {
          setInboxOpen(false);
          return;
        }
        if (invOpenRef.current) {
          setInvOpen(false);
          return;
        }
        if (mapOpenRef.current) {
          setMapOpen(false);
          return;
        }
        if (whisperOpenRef.current) {
          setWhisperOpen(false);
          return;
        }
        setPaused((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      engine.dispose();
    };
  }, [nav, cityKey, openSettings, blocked]);

  useEffect(() => {
    const line = hud.lastWhisper;
    if (!line || line.id === seenWhisper.current) return;
    seenWhisper.current = line.id;
    if (line.fromName === "You") return;
    setWhisperTarget({ sessionId: line.fromSession, name: line.fromName });
    setWhisperOpen(true);
    setChatOpen(false);
  }, [hud.lastWhisper]);

  useEffect(() => {
    const el = whisperLogRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [hud.whispers, whisperOpen]);

  // Pull the board when it opens, and again whenever you walk back into a
  // station with it open. New reports also arrive unprompted, pushed by the
  // server to everyone currently at a desk.
  useEffect(() => {
    if (crimeOpen && hud.inStation) engineRef.current?.requestCrimeReports();
  }, [crimeOpen, hud.inStation]);

  // Walking out closes it: the board is a thing you read at the desk.
  useEffect(() => {
    if (!hud.inStation) setCrimeOpen(false);
  }, [hud.inStation]);

  // Walking out closes the wardrobe; you change clothes at the shop.
  useEffect(() => {
    if (!hud.inFashion) setFitOpen(false);
  }, [hud.inFashion]);

  // A failure from a previous visit is not news on the next one.
  useEffect(() => {
    if (fitOpen) setBuyError(null);
  }, [fitOpen]);

  // The mirror follows the wardrobe: open it and the camera swings to your
  // front, close it and the normal follow camera comes back. Also cleared on
  // the way out of the building, in case the panel never closed properly.
  useEffect(() => {
    engineRef.current?.setMirrorView(fitOpen && hud.inFashion);
  }, [fitOpen, hud.inFashion]);

  useEffect(() => {
    if (paused && document.pointerLockElement) document.exitPointerLock();
    if (paused) {
      setSaveState("idle");
      setSaveNote("");
    }
  }, [paused]);

  function setPad(x: number, z: number) {
    padRef.current = { x, z };
    engineRef.current?.setPad(x, z);
  }

  useEffect(() => {
    if (hud.namePrompt) setHomeName(hud.namePrompt.current);
  }, [hud.namePrompt?.id]);

  useEffect(() => {
    if (hud.carListPrompt) setCarPrice(String(hud.carListPrompt.suggested || MIN_ASKING_PRICE));
  }, [hud.carListPrompt?.id]);

  useEffect(() => {
    if (!hud.listPrompt) return;
    setListPrice(String(hud.listPrompt.suggested));
  }, [hud.listPrompt?.id]);

  useEffect(() => {
    if (!mapOpen) return;
    engineRef.current?.requestRoster();
    const t = window.setInterval(() => engineRef.current?.requestRoster(), 3000);
    return () => window.clearInterval(t);
  }, [mapOpen]);

  useEffect(() => {
    if (inboxOpen && inboxTab === "messages") engineRef.current?.markMessagesRead();
  }, [inboxOpen, inboxTab, hud.unreadMessages]);

  function closeListing() {
    engineRef.current?.cancelListing();
    setListPrice("");
  }

  function openWhisper(sessionId: string, name: string) {
    setWhisperTarget({ sessionId, name });
    setWhisperOpen(true);
    setChatOpen(false);
  }

  async function toggleVoice() {
    if (voiceState === "on") {
      engineRef.current?.disableVoice();
      setVoiceState("off");
      setVoiceError(null);
      return;
    }
    setVoiceState("requesting");
    setVoiceError(null);
    try {
      await engineRef.current?.enableVoice();
      setVoiceState("on");
    } catch (error) {
      setVoiceState("error");
      setVoiceError(error instanceof Error ? error.message : "Could not access your microphone.");
    }
  }

  const theme = CITIES[hud.city];
  const thread = whisperTarget
    ? hud.whispers.filter((w) => w.fromSession === whisperTarget.sessionId || w.toSession === whisperTarget.sessionId)
    : [];

  // Before anything else: a device that cannot play never sees the canvas.
  if (blocked) return <DesktopOnly reason={blocked} />;

  return (
    <div className="game-root">
      <canvas ref={canvasRef} />

      <div className="nametag-layer">
        {hud.nametags.map((tag) =>
          tag.visible ? (
            tag.kind === "home" ? (
              <div
                key={tag.sessionId}
                className={`nametag home-tag home-tag-${tag.tone ?? "sale"}`}
                style={{ left: tag.x, top: tag.y }}
              >
                <span className="nametag-name">{tag.name}</span>
                {tag.detail && <span className="home-tag-detail">{tag.detail}</span>}
              </div>
            ) : tag.kind === "building" ? (
              <div key={tag.sessionId} className="nametag building-tag" style={{ left: tag.x, top: tag.y }}>
                <span className="nametag-name">{tag.name}</span>
              </div>
            ) : (
              <button
                key={tag.sessionId}
                type="button"
                className={`nametag ${tag.inRange ? "in-range" : ""}`}
                style={{ left: tag.x, top: tag.y }}
                onClick={() => tag.inRange && openWhisper(tag.sessionId, tag.name)}
              >
                {tag.bubble && <span className="speech-bubble">{tag.bubble}</span>}
                <span className="nametag-name">{tag.name}</span>
              </button>
            )
          ) : null,
        )}
      </div>

      <div className="hud-top-left">
        <button className="hud-btn pause" type="button" onClick={() => setPaused(true)} aria-label="Pause">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="#fff">
            <rect x="2" y="1" width="3" height="12" />
            <rect x="9" y="1" width="3" height="12" />
          </svg>
        </button>
        <div className="tribute-chip">
          {hud.tribute} {CURRENCY}
        </div>
      </div>
      <button
        className="hud-btn bag-btn"
        type="button"
        onClick={() => {
          setInvOpen((open) => !open);
          setBuyError(null);
        }}
        aria-label="Inventory"
        title="Inventory (I)"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="1.6">
          <path d="M2.5 5h11l-.9 8.2a1 1 0 0 1-1 .8H4.4a1 1 0 0 1-1-.8L2.5 5Z" />
          <path d="M5.6 5V3.6a2.4 2.4 0 0 1 4.8 0V5" />
        </svg>
        {ownedCount > 0 && <span className="bag-count">{ownedCount}</span>}
      </button>
      <button
        className="hud-btn inbox-btn"
        type="button"
        onClick={() => setInboxOpen((open) => !open)}
        aria-label={hud.unreadMessages > 0 ? `Messages, ${hud.unreadMessages} unread` : "Messages"}
        title="Messages"
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="1.6">
          <rect x="1.5" y="3" width="13" height="10" rx="1" />
          <path d="M1.5 4.2 8 8.6l6.5-4.4" />
        </svg>
        {hud.unreadMessages > 0 && <span className="inbox-badge">{hud.unreadMessages}</span>}
      </button>
      <button className="hud-btn menu" type="button" onClick={() => setSettingsOpen(true)} aria-label="Menu">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="#fff">
          <rect y="2" width="16" height="2" />
          <rect y="7" width="16" height="2" />
          <rect y="12" width="16" height="2" />
        </svg>
      </button>
      <button
        className={`hud-btn voice ${voiceState}`}
        type="button"
        onClick={() => void toggleVoice()}
        disabled={voiceState === "requesting"}
        aria-label={voiceState === "on" ? "Turn voice chat off" : "Turn voice chat on"}
        title={voiceState === "on" ? "Voice chat on" : "Enable proximity voice chat"}
      >
        <span className="voice-level" style={{ height: `${Math.round(hud.voiceLevel * 100)}%` }} />
        <svg className="voice-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" />
          {voiceState !== "on" && <path d="M3 3l18 18" />}
        </svg>
      </button>
      <AudioOutputPicker
        level={hud.nearbyVoiceLevel}
        current={audioOutput}
        getPeers={() => engineRef.current?.voiceDiagnostics() ?? []}
        onPick={(deviceId) => {
          setAudioOutput(deviceId);
          void engineRef.current?.setAudioOutput(deviceId);
        }}
      />
      {voiceError && <div className="voice-toast">{voiceError}</div>}

      <div className="health-bar">
        <label>HEALTH</label>
        <div className="bar">
          <div
            className="fill"
            style={{
              width: `${Math.max(0, Math.min(100, hud.health))}%`,
              background: hud.health > 50 ? "#3ddc84" : hud.health > 20 ? "#ffb830" : "#ff5a5a",
            }}
          />
        </div>
      </div>
      {settings.showFps && <div className="fps">{hud.fps} FPS</div>}
      {gunSpec(hud.gun)?.ranged && !paused && (
        <div className={`crosshair ${hud.aimTarget ? "locked" : ""}`} aria-hidden>
          <i />
          <i />
          <i />
          <i />
          {hud.aimTarget && <span className="crosshair-name">{hud.aimTarget}</span>}
        </div>
      )}
      {loading && (
        <div className="boot" role="status" aria-live="polite">
          <div className="boot-card">
            <p className="boot-mark">TRIBE</p>
            <div className="boot-bar">
              <span />
            </div>
            <p className="boot-note">Finding your district…</p>
          </div>
        </div>
      )}

      {hud.gateMessage && <div className="gate-toast">{hud.gateMessage}</div>}
      {hud.notice && <div className="gate-toast home-toast">{hud.notice}</div>}
      {hud.prompt && <div className="prompt">{hud.prompt}</div>}

      {/* Bottom-right action row, sat left of the minimap. One container so the
          two sit together and the hint keeps its place when the Aim button is
          absent - positioning each separately meant the hint jumped sideways
          the moment a weapon was drawn. */}
      {!anyPanelOpen && (
        <div className="hud-actions">
          {/* A standing legend, not a one-time tip. Nothing on screen suggests
              the right button turns the camera, and the control is used
              constantly - so it stays put beside Aim rather than vanishing once
              the player has managed it. */}
          <div className="pan-hint">
            <span className="pan-hint-key">Right click</span> to pan
          </div>

          <button
            className="aim-toggle shot-btn"
            type="button"
            disabled={shooting}
            onClick={takeShot}
            title="Screenshot (P)"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 5.5h2.6l1-1.6h4.8l1 1.6H14v7.2H2z" />
              <circle cx="8" cy="9" r="2.4" />
            </svg>
            {shooting ? "…" : "Photo"}
            <span className="aim-key">P</span>
          </button>

          {/* Quick action for first-person mode. Only with a ranged weapon out,
              since that is the only thing aiming applies to. On a touch device
              this is the only way in or out; on desktop it doubles as a
              reminder that X does the same, because a locked pointer cannot
              click it. */}
          {gunSpec(hud.gun)?.ranged && (
            <button
              className={hud.aiming ? "aim-toggle on" : "aim-toggle"}
              type="button"
              onClick={() => engineRef.current?.toggleHolster()}
              title={hud.aiming ? "Lower weapon (X)" : "Raise weapon and aim (X)"}
            >
              <span className="aim-dot" aria-hidden="true" />
              {hud.aiming ? "Exit aim" : "Aim"}
              <span className="aim-key">X</span>
            </button>
          )}
        </div>
      )}

      <div className="hud-move">
        <div className="move-pad">
          <div className="label">MOVE</div>
          <button type="button" className="n" onPointerDown={() => setPad(0, 1)} onPointerUp={() => setPad(0, 0)} onPointerLeave={() => setPad(0, 0)}>
            ▲
          </button>
          <button type="button" className="s" onPointerDown={() => setPad(0, -1)} onPointerUp={() => setPad(0, 0)} onPointerLeave={() => setPad(0, 0)}>
            ▼
          </button>
          <button type="button" className="w" onPointerDown={() => setPad(-1, 0)} onPointerUp={() => setPad(0, 0)} onPointerLeave={() => setPad(0, 0)}>
            ◀
          </button>
          <button type="button" className="e" onPointerDown={() => setPad(1, 0)} onPointerUp={() => setPad(0, 0)} onPointerLeave={() => setPad(0, 0)}>
            ▶
          </button>
        </div>
        <div className={`control-legend ${controlsOpen ? "open" : ""}`}>
          <button
            type="button"
            className="control-legend-head"
            onClick={() => setControlsOpen((open) => !open)}
            aria-expanded={controlsOpen}
          >
            <span className="label">CONTROLS</span>
            <span className="control-legend-chevron" aria-hidden>
              ▲
            </span>
          </button>
          {controlsOpen && (
            <ul>
              {[
                ["WASD", "Walk"],
                ["Shift", "Sprint"],
                ["Space", "Jump"],
                ["RMB", "Look"],
                ["E", "Enter / exit"],
                ["F / LMB", gunSpec(hud.gun)?.ranged ? "Fire weapon" : "Punch"],
                ["C", "Sit (near chair)"],
                ["B", "Bid / list home"],
                ["L", "Lock / unlock"],
                ["Enter", "Chat"],
                ["I", "Inventory"],
                ["N", "Messages"],
                ["G", "Add friend"],
                ["T", "Trade"],
                ["M", "Map"],
                // Read off the same list the keys are bound from, so the help
                // cannot claim a slot that does not exist.
                [
                  armSlots().length > 1 ? `1-${armSlots().length}` : "1",
                  `Draw ${armSlots().map((g) => g.label).join(" / ")}`,
                ],
                ["0", "Put weapon away"],
                ["P", "Screenshot"],
                ["X", "Lower / raise weapon"],
                ["Esc", "Pause"],
              ].map(([key, what]) => (
                <li key={key}>
                  <kbd>{key}</kbd>
                  <span>{what}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <aside className="minimap">
        <div className="minimap-head">
          <strong>{zoneLabel(hud.x, hud.z)}</strong>
          <span className="minimap-north">N</span>
        </div>
        <MiniMap
          city={hud.city}
          x={hud.x}
          z={hud.z}
          heading={hud.heading}
          citizens={hud.citizens}
          homes={hud.ownedHomes}
          cars={hud.ownedCars}
        />
        <div className="minimap-foot">
          <span>{hud.block}</span>
          <span style={{ color: theme.accent }}>TIER {theme.tier}</span>
        </div>
        <button className="minimap-open" type="button" onClick={() => setMapOpen(true)}>
          View full map
          {hud.citizens.filter((c) => !c.you).length > 0
            ? ` · ${hud.citizens.filter((c) => !c.you).length} online`
            : ""}
        </button>
      </aside>

      {mapOpen && (
        <WorldMap
          youCity={hud.city}
          accessTier={hud.accessTier}
          citizens={hud.roster.length > 0 ? hud.roster : hud.citizens}
          homes={hud.ownedHomes}
          cars={hud.ownedCars}
          heading={hud.heading}
          connected={hud.connected}
          onClose={() => setMapOpen(false)}
        />
      )}

      {whisperOpen && whisperTarget && (
        <form
          className="chat-panel whisper-panel"
          onSubmit={(e) => {
            e.preventDefault();
            engineRef.current?.sendWhisper(whisperTarget.sessionId, whisperText);
            setWhisperText("");
          }}
        >
          <div className="whisper-head">
            <strong>Talking with {whisperTarget.name}</strong>
            <button type="button" className="whisper-close" onClick={() => setWhisperOpen(false)} aria-label="Close">
              ×
            </button>
          </div>
          <div className="chat-log" ref={whisperLogRef}>
            {thread.length === 0 && <div className="whisper-empty">Say hello — they can hear you in real time.</div>}
            {thread.map((line) => (
              <div key={line.id} className={line.fromName === "You" ? "whisper-mine" : "whisper-theirs"}>
                <strong>{line.fromName}: </strong>
                {line.text}
              </div>
            ))}
          </div>
          <input
            className="input"
            value={whisperText}
            onChange={(e) => setWhisperText(e.target.value)}
            placeholder={`Message ${whisperTarget.name}...`}
            autoFocus
            maxLength={180}
          />
        </form>
      )}

      {chatOpen && !whisperOpen && (
        <form
          className="chat-panel"
          onSubmit={(e) => {
            e.preventDefault();
            engineRef.current?.sendChat(chatText);
            setChatText("");
          }}
        >
          <div className="chat-log">
            {hud.chat.map((line, i) => (
              <div key={i}>
                <strong>{line.name}: </strong>
                {line.text}
              </div>
            ))}
          </div>
          <input className="input" value={chatText} onChange={(e) => setChatText(e.target.value)} placeholder="Message the city..." autoFocus />
        </form>
      )}

      {hud.carListPrompt && (
        <form
          className="list-panel"
          onSubmit={(e) => {
            e.preventDefault();
            engineRef.current?.listCar(Number(carPrice));
          }}
        >
          <p className="list-kicker">SELL YOUR CAR</p>
          <label htmlFor="car-price">ASKING PRICE</label>
          <div className="list-input-row">
            <input
              id="car-price"
              className="input"
              type="number"
              min={MIN_ASKING_PRICE}
              step={100}
              value={carPrice}
              onChange={(e) => setCarPrice(e.target.value)}
            />
            <span className="list-unit">{CURRENCY}</span>
          </div>
          <p className="list-note">
            Anyone without a car can buy it at this price. It stays yours and driveable until somebody pays.
          </p>
          <div className="list-actions">
            <button className="btn btn-accent" type="submit">
              List for sale
            </button>
            <button className="btn" type="button" onClick={() => engineRef.current?.cancelCarListing()}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {hud.namePrompt && (
        <form
          className="list-panel"
          onSubmit={(e) => {
            e.preventDefault();
            engineRef.current?.nameHome(hud.namePrompt!.id, homeName);
          }}
        >
          <p className="list-kicker">
            {hud.namePrompt.boughtFrom ? "THE PLACE IS YOURS" : "NAME YOUR HOME"}
          </p>
          {hud.namePrompt.boughtFrom && (
            <p className="list-note" style={{ marginBottom: 10 }}>
              You bought this home from {hud.namePrompt.boughtFrom}.
              {hud.namePrompt.inheritedName
                ? ` The sign still reads “${hud.namePrompt.inheritedName}” — give it a name of your own.`
                : " Give it a name of your own."}
            </p>
          )}
          <label htmlFor="home-name">SIGN ABOVE THE DOOR</label>
          <div className="list-input-row">
            <input
              id="home-name"
              className="input"
              maxLength={HOME_NAME_MAX}
              placeholder="e.g. The Vault"
              value={homeName}
              onChange={(e) => setHomeName(e.target.value)}
            />
            <span className="list-unit">{homeName.trim().length} / {HOME_NAME_MAX}</span>
          </div>
          <p className="list-note">
            Shown on the sign over your door and in your property list. Leave it empty to clear the name.
          </p>
          <div className="list-actions">
            <button className="btn btn-accent" type="submit">
              Save name
            </button>
            <button className="btn" type="button" onClick={() => engineRef.current?.cancelHomeName()}>
              {hud.namePrompt.boughtFrom ? "Later" : "Cancel"}
            </button>
          </div>
        </form>
      )}

      {hud.listPrompt && (
        <form
          className="list-panel"
          onSubmit={(e) => {
            e.preventDefault();
            engineRef.current?.listHome(Number(listPrice));
          }}
        >
          <p className="list-kicker">SELL YOUR HOME</p>
          <label htmlFor="asking-price">ASKING PRICE</label>
          <div className="list-input-row">
            <input
              id="asking-price"
              className="input"
              type="number"
              // No max: sellers name any price they like and the market decides.
              // The floor mirrors the server's, so the browser never accepts a
              // number the server will turn around and reject.
              min={MIN_ASKING_PRICE}
              step={1}
              value={listPrice}
              onChange={(e) => setListPrice(e.target.value)}
              autoFocus
            />
            <span className="list-unit">{CURRENCY}</span>
          </div>
          <p className="list-note">
            Anyone can buy it at this price the moment you list it. No bidding, no waiting - withdraw the
            listing any time before someone pays.
          </p>
          <div className="list-actions">
            <button className="btn btn-accent" type="submit">
              List for sale
            </button>
            <button className="btn" type="button" onClick={closeListing}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {hud.joinFailure === "full" && <WorldFullScreen onRetry={() => engineRef.current?.retryJoin() ?? Promise.resolve(false)} />}

      {hud.sessionEnded && (
        <div className="session-ended">
          <div className="session-ended-card">
            <p className="list-kicker">SESSION CLOSED</p>
            <p className="session-ended-body">{hud.sessionEnded}</p>
            <div className="list-actions">
              <button className="btn btn-accent" type="button" onClick={() => window.location.reload()}>
                Resume here
              </button>
              <button className="btn" type="button" onClick={() => nav("/")}>
                Leave
              </button>
            </div>
          </div>
        </div>
      )}

      {hud.offerPrompt && (
        <div className="list-panel">
          <p className="list-kicker">OFFER ON YOUR HOME</p>
          <p className="offer-amount">{hud.offerPrompt.bid} {CURRENCY}</p>
          <p className="list-note">
            High bidder: <strong>{hud.offerPrompt.bidder || "a citizen"}</strong>. Accept and the {CURRENCY} is yours.
            Reject and their bid is refunded and the home comes off the market.
            {hud.offerPrompt.decideBy > 0 && (
              <> Auto-accepts {new Date(hud.offerPrompt.decideBy).toLocaleString()}.</>
            )}
          </p>
          <div className="list-actions">
            <button className="btn btn-accent" type="button" onClick={() => engineRef.current?.decideOffer(true)}>
              Accept
            </button>
            <button className="btn" type="button" onClick={() => engineRef.current?.decideOffer(false)}>
              Reject
            </button>
          </div>
          <button className="list-later" type="button" onClick={() => engineRef.current?.closeOffer()}>
            Decide later
          </button>
        </div>
      )}

      {inboxOpen && (
        <div className="inbox-panel">
          <div className="inbox-head">
            <div className="inbox-tabs">
              <button
                type="button"
                className={inboxTab === "messages" ? "on" : ""}
                onClick={() => setInboxTab("messages")}
              >
                Messages
                {hud.unreadMessages > 0 && <span className="tab-count">{hud.unreadMessages}</span>}
              </button>
              <button
                type="button"
                className={inboxTab === "friends" ? "on" : ""}
                onClick={() => setInboxTab("friends")}
              >
                Friends
                {hud.friendRequests > 0 && <span className="tab-count">{hud.friendRequests}</span>}
              </button>
            </div>
            <button type="button" onClick={() => setInboxOpen(false)} aria-label="Close">
              ✕
            </button>
          </div>

          {inboxTab === "messages" ? (
            hud.messages.length === 0 ? (
              <p className="inbox-empty">Nothing yet. Bids, sales and offers land here.</p>
            ) : (
              <ul className="inbox-list">
                {hud.messages.map((m) => (
                  <li key={m.id} className={`inbox-item ${m.read ? "" : "unread"}`}>
                    <span className={`inbox-kind inbox-kind-${m.kind}`}>{m.kind}</span>
                    <span className="inbox-body">{m.body}</span>
                    <time className="inbox-time">{new Date(m.at).toLocaleString()}</time>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <FriendsTab
              friends={hud.friends}
              onRespond={(wallet, accept) => engineRef.current?.respondToFriend(wallet, accept)}
              onRemove={(wallet) => engineRef.current?.removeFriend(wallet)}
            />
          )}
        </div>
      )}

      {invOpen && (
        <InventoryPanel
          tribute={hud.tribute}
          inventory={hud.inventory}
          inStore={hud.inStore}
          accessTier={hud.accessTier}
          gun={hud.gun}
          pet={hud.pet}
          accessories={hud.accessories}
          buyError={buyError}
          onClose={() => setInvOpen(false)}
          onBuy={(id: ItemId) => {
            // Async now: the wallet has to confirm the payment before the
            // server will grant anything.
            setBuyError(null);
            void engineRef.current?.buyItem(id).then((err) => setBuyError(err ?? null));
          }}
          onEquip={(id: ItemId) => engineRef.current?.equipItem(id)}
          homes={hud.ownedHomes}
          cars={hud.ownedCars}
        />
      )}

      {hud.tradeInvite && !hud.trade && (
        <div className="trade-panel" style={{ left: 18, top: 80, padding: 16, width: 280 }}>
          <h3 style={{ fontStretch: "140%", marginBottom: 8 }}>Trade request</h3>
          <p style={{ color: "#aaa", marginBottom: 10 }}>
            {hud.tradeInvite.fromName} wants to trade with you.
          </p>
          <button className="btn btn-accent" type="button" onClick={() => engineRef.current?.answerTradeInvite(true)}>
            Open trade
          </button>
          <button
            className="btn btn-outline"
            type="button"
            style={{ marginTop: 8, width: "100%" }}
            onClick={() => engineRef.current?.answerTradeInvite(false)}
          >
            Decline
          </button>
        </div>
      )}

      {/* Signage rather than a modal: it is telling you to hang out, so it must
          not be something you have to dismiss before you can. Non-interactive,
          so it never takes the cursor or blocks a click behind it. */}
      {hud.inTownhall && (
        <aside className="townhall-notice" aria-live="polite">
          <p className="townhall-kicker">NOTICE FROM THE CLERK</p>
          <h3>Voting &amp; elections are coming</h3>
          <p>
            Official elections, ballots and council seats are being built. Nothing to vote on yet —
            the chamber is open in the meantime.
          </p>
          <p className="townhall-hang">Take a seat, meet your district, and hang out.</p>
        </aside>
      )}

      {fitOpen && hud.inFashion && (
        <Wardrobe
          inventory={hud.inventory}
          current={hud.outfit}
          tribute={hud.tribute}
          error={buyError}
          onWear={(id) => engineRef.current?.wearOutfit(id as never)}
          onBuy={(id) => {
            setBuyError(null);
            void engineRef.current?.buyItem(id as ItemId).then((err) => setBuyError(err ?? null));
          }}
          onClose={() => setFitOpen(false)}
        />
      )}

      {shot && (
        <ShotPreview blob={shot} caption={hud.block} onClose={() => setShot(null)} />
      )}

      {crimeOpen && hud.inStation && (
        <CrimeBoard
          reports={hud.crimeReports}
          nearby={engineRef.current?.nearbyNames() ?? []}
          onFile={(offence, accused, note) => engineRef.current?.reportCrime(offence, accused, note)}
          onClose={() => setCrimeOpen(false)}
        />
      )}

      {hud.trade && (
        <TradePanel
          trade={hud.trade}
          inventory={hud.inventory}
          onOffer={(items) => engineRef.current?.setTradeOffer(items)}
          onLock={(locked) => engineRef.current?.lockTrade(locked)}
          onCancel={() => engineRef.current?.cancelTrade()}
        />
      )}

      {tradeOpen && !hud.trade && (
        <div className="trade-panel" style={{ right: 18, top: 80, padding: 16, width: 280 }}>
          <h3 style={{ fontStretch: "140%", marginBottom: 8 }}>Trade</h3>
          <p style={{ color: "#aaa", marginBottom: 10 }}>
            {hud.nearbyPlayer
              ? `Invite ${hud.nearbyPlayer.name} to trade. You will both choose what to offer.`
              : "Get close to another citizen to trade."}
          </p>
          <button
            className="btn btn-accent"
            type="button"
            disabled={!hud.nearbyPlayer}
            onClick={() => {
              if (hud.nearbyPlayer) engineRef.current?.inviteTrade(hud.nearbyPlayer.sessionId);
              setTradeOpen(false);
            }}
          >
            Send trade request
          </button>
          <button className="btn btn-outline" type="button" style={{ marginTop: 8, width: "100%" }} onClick={() => setTradeOpen(false)}>
            Close
          </button>
        </div>
      )}

      {paused && (
        <div className="pause-menu">
          <button className="btn btn-accent" type="button" onClick={() => setPaused(false)}>
            Resume
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            disabled={saveState === "saving"}
            onClick={() => {
              setSaveState("saving");
              void requestSave(engineRef.current).then((result) => {
                setSaveState(result.ok ? "saved" : "failed");
                setSaveNote(result.text);
              });
            }}
          >
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Location saved ✓" : "Save location"}
          </button>
          {saveState === "failed" && <p className="pause-note">{saveNote}</p>}
          <button className="btn btn-ghost" type="button" onClick={() => setSettingsOpen(true)}>
            Settings
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => nav("/docs")}>
            Docs
          </button>
          <button
            className="btn btn-outline"
            type="button"
            onClick={() => {
              // Save before tearing the room down. Leaving saves too, but that
              // depends on the socket closing cleanly; doing it here first
              // means a killed tab or a dropped connection cannot lose the spot.
              void requestSave(engineRef.current).finally(() => nav("/"));
            }}
          >
            Disconnect
          </button>
        </div>
      )}

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSave={(next) => {
          setSettings(next);
          engineRef.current?.setSettings(next);
        }}
      />
    </div>
  );
}
