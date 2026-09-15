import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CITIES, gunSpec } from "@the-block/shared";
import type { GameSettings } from "@the-block/shared";
import { GameEngine, type HudState } from "../game/engine";
import { loadCharacter, loadCharacterForWallet, loadSettings } from "../lib/storage";
import { loadWallet } from "../lib/wallet";
import { SettingsModal } from "./SettingsModal";
import { WorldMap } from "../components/WorldMap";
import { InventoryPanel, itemName } from "../components/InventoryPanel";
import { FriendsTab } from "../components/FriendsTab";
import { MiniMap, zoneLabel } from "../components/MiniMap";
import type { ItemId } from "@the-block/shared";

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
  credits: 500,
  inventory: [],
  inStore: false,
  gun: null,
  pet: null,
  accessories: [],
  pendingTrade: null,
  voiceLevel: 0,
  notice: null,
  listPrompt: null,
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
};

export function GamePage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const cityKey = params.get("city") ?? "";
  const openSettings = params.get("settings") === "1";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [hud, setHud] = useState<HudState>(EMPTY);
  const [paused, setPaused] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState("");
  const [whisperOpen, setWhisperOpen] = useState(false);
  const [whisperTarget, setWhisperTarget] = useState<{ sessionId: string; name: string } | null>(null);
  const [whisperText, setWhisperText] = useState("");
  const [tradeOpen, setTradeOpen] = useState(false);
  const [invOpen, setInvOpen] = useState(false);
  const [listPrice, setListPrice] = useState("");
  const [listMinutes, setListMinutes] = useState("");
  const [inboxOpen, setInboxOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [inboxTab, setInboxTab] = useState<"messages" | "friends">("messages");
  const [tradeItem, setTradeItem] = useState<string>("mystery-crate");
  const [buyError, setBuyError] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [voiceState, setVoiceState] = useState<"off" | "requesting" | "on" | "error">("off");
  const [voiceError, setVoiceError] = useState<string | null>(null);
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

  useEffect(() => {
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
    void engine.start(canvas, character, loadSettings(), setHud);
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
        setInvOpen((open) => !open);
        setBuyError(null);
      }
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
  }, [nav, cityKey, openSettings]);

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

  useEffect(() => {
    if (paused && document.pointerLockElement) document.exitPointerLock();
  }, [paused]);

  function setPad(x: number, z: number) {
    padRef.current = { x, z };
    engineRef.current?.setPad(x, z);
  }

  useEffect(() => {
    if (!hud.listPrompt) return;
    setListPrice(String(hud.listPrompt.suggested));
    setListMinutes(String(hud.listPrompt.suggestedMinutes));
  }, [hud.listPrompt?.id]);

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
        <div className="credits-chip">{hud.credits} CR</div>
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
      {hud.gateMessage && <div className="gate-toast">{hud.gateMessage}</div>}
      {hud.notice && <div className="gate-toast home-toast">{hud.notice}</div>}
      {hud.prompt && <div className="prompt">{hud.prompt}</div>}

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
          citizens={hud.citizens}
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

      {hud.listPrompt && (
        <form
          className="list-panel"
          onSubmit={(e) => {
            e.preventDefault();
            engineRef.current?.listHome(Number(listPrice), Number(listMinutes));
          }}
        >
          <p className="list-kicker">SELL YOUR HOME</p>
          <label htmlFor="asking-price">ASKING PRICE</label>
          <div className="list-input-row">
            <input
              id="asking-price"
              className="input"
              type="number"
              min={1}
              max={99999}
              step={1}
              value={listPrice}
              onChange={(e) => setListPrice(e.target.value)}
              autoFocus
            />
            <span className="list-unit">cr</span>
          </div>
          <label htmlFor="auction-minutes">AUCTION LENGTH</label>
          <div className="list-input-row">
            <input
              id="auction-minutes"
              className="input"
              type="number"
              min={1}
              max={43200}
              step={1}
              value={listMinutes}
              onChange={(e) => setListMinutes(e.target.value)}
            />
            <span className="list-unit">min</span>
          </div>
          <div className="list-presets">
            {[
              { label: "1h", value: 60 },
              { label: "6h", value: 360 },
              { label: "24h", value: 1440 },
              { label: "3d", value: 4320 },
              { label: "7d", value: 10080 },
            ].map((preset) => (
              <button
                key={preset.value}
                type="button"
                className={`chip ${Number(listMinutes) === preset.value ? "on" : ""}`}
                onClick={() => setListMinutes(String(preset.value))}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <p className="list-note">
            The clock starts on the first bid. When it ends you choose whether to accept the winning offer.
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
          <p className="offer-amount">{hud.offerPrompt.bid} cr</p>
          <p className="list-note">
            High bidder: <strong>{hud.offerPrompt.bidder || "a citizen"}</strong>. Accept and the credits are yours.
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
          credits={hud.credits}
          inventory={hud.inventory}
          inStore={hud.inStore}
          accessTier={hud.accessTier}
          gun={hud.gun}
          pet={hud.pet}
          accessories={hud.accessories}
          buyError={buyError}
          onClose={() => setInvOpen(false)}
          onBuy={(id: ItemId) => {
            const err = engineRef.current?.buyItem(id) ?? null;
            setBuyError(err);
          }}
          onEquip={(id: ItemId) => engineRef.current?.equipItem(id)}
          homes={hud.ownedHomes}
          cars={hud.ownedCars}
        />
      )}

      {hud.pendingTrade && (
        <div className="trade-panel" style={{ left: 18, top: 80, padding: 16, width: 280 }}>
          <h3 style={{ fontStretch: "140%", marginBottom: 8 }}>Incoming trade</h3>
          <p style={{ color: "#aaa", marginBottom: 10 }}>
            {hud.pendingTrade.fromName} offered you {itemName(hud.pendingTrade.item)}.
          </p>
          <button className="btn btn-accent" type="button" onClick={() => engineRef.current?.respondTrade(true)}>
            Accept
          </button>
          <button
            className="btn btn-outline"
            type="button"
            style={{ marginTop: 8, width: "100%" }}
            onClick={() => engineRef.current?.respondTrade(false)}
          >
            Decline
          </button>
        </div>
      )}

      {tradeOpen && (
        <div className="trade-panel" style={{ right: 18, top: 80, padding: 16, width: 280 }}>
          <h3 style={{ fontStretch: "140%", marginBottom: 8 }}>Trade</h3>
          <p style={{ color: "#aaa", marginBottom: 10 }}>
            {hud.nearbyPlayer ? `Offer an item to ${hud.nearbyPlayer.name}` : "Get close to another citizen to trade."}
          </p>
          <select
            className="select"
            style={{ width: "100%", marginBottom: 10 }}
            value={tradeItem}
            onChange={(e) => setTradeItem(e.target.value)}
          >
            {hud.inventory.map((stack) => (
              <option key={stack.id} value={stack.id}>
                {itemName(stack.id)}
                {stack.qty > 1 ? ` ×${stack.qty}` : ""}
              </option>
            ))}
          </select>
          <button
            className="btn btn-accent"
            type="button"
            disabled={!hud.nearbyPlayer || hud.inventory.length === 0}
            onClick={() => {
              if (hud.nearbyPlayer) engineRef.current?.sendTrade(hud.nearbyPlayer.sessionId, tradeItem);
              setTradeOpen(false);
            }}
          >
            Offer item
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
          <button className="btn btn-ghost" type="button" onClick={() => setSettingsOpen(true)}>
            Settings
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => nav("/docs")}>
            Docs
          </button>
          <button className="btn btn-outline" type="button" onClick={() => nav("/")}>
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
