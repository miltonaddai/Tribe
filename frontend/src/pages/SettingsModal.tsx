import { useEffect, useState } from "react";
import type { GameSettings } from "@tribe/shared";
import { DEFAULT_SETTINGS } from "@tribe/shared";
import { loadSettings, persistSettings, saveSettings } from "../lib/storage";
import { shorten } from "../lib/wallet";
import { useWallet } from "../state/WalletStore";
import { Dropdown } from "../components/Dropdown";

const VOICE = ["Push to Talk", "Open Mic", "Off"];
const FILTER = ["Standard", "Strict", "Off"];
const TIME = ["Local Time", "Always Day", "Always Night"];
const QUALITY = ["Low", "Medium", "High", "Ultra"];
const TRADE = ["Everyone", "Friends Only", "Off"];

export function SettingsModal({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave?: (s: GameSettings) => void;
}) {
  const { wallet } = useWallet();
  const [s, setS] = useState<GameSettings>(() => loadSettings());

  useEffect(() => {
    if (open) setS(loadSettings());
  }, [open]);

  if (!open) return null;

  function patch(p: Partial<GameSettings>) {
    setS((prev) => ({ ...prev, ...p }));
  }

  return (
    <div className="settings-overlay">
      <div className="settings-panel">
        <div className="settings-head">
          <div>
            <h1>Settings</h1>
            <p style={{ color: "#888" }}>Changes apply straight away and are remembered on this device.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="settings-grid">
          <section className="settings-card">
            <h2>AUDIO</h2>
            <Slider label="Master Volume" value={s.masterVolume} onChange={(v) => patch({ masterVolume: v })} />
            <Slider label="Music" value={s.music} onChange={(v) => patch({ music: v })} />
            <Slider label="Sound Effects" value={s.sfx} onChange={(v) => patch({ sfx: v })} />
            <Select label="Voice Chat" value={s.voiceChat} options={VOICE} onChange={(v) => patch({ voiceChat: v })} />
          </section>
          <section className="settings-card">
            <h2>GAMEPLAY</h2>
            <Slider label="Camera Sensitivity" value={s.cameraSensitivity} onChange={(v) => patch({ cameraSensitivity: v })} />
            <Toggle label="Invert Y-Axis" on={s.invertY} onChange={(v) => patch({ invertY: v })} />
            <Toggle label="Low Health Warnings" on={s.healthWarnings} onChange={(v) => patch({ healthWarnings: v })} />
            <Select label="Chat Filter" value={s.chatFilter} options={FILTER} onChange={(v) => patch({ chatFilter: v })} />
          </section>
          <section className="settings-card">
            <h2>GRAPHICS</h2>
            <Select label="Quality Preset" value={s.qualityPreset} options={QUALITY} onChange={(v) => patch({ qualityPreset: v })} />
            <Slider label="Render Distance" value={s.renderDistance} onChange={(v) => patch({ renderDistance: v })} />
            <Select label="Time of Day" value={s.timeOfDay} options={TIME} onChange={(v) => patch({ timeOfDay: v as GameSettings["timeOfDay"] })} />
            <Toggle label="Show FPS Counter" on={s.showFps} onChange={(v) => patch({ showFps: v })} />
            <Toggle label="Motion Blur" on={s.motionBlur} onChange={(v) => patch({ motionBlur: v })} />
          </section>
          <section className="settings-card">
            <h2>ACCOUNT</h2>
            <div className="setting-row">
              <span>Connected Wallet</span>
              <div className="wallet-chip">{wallet ? shorten(wallet.address) : "Not connected"}</div>
            </div>
            <Toggle label="Show Wallet Publicly" on={s.showWalletPublicly} onChange={(v) => patch({ showWalletPublicly: v })} />
            <Select label="Trade Requests" value={s.tradeRequests} options={TRADE} onChange={(v) => patch({ tradeRequests: v })} />
            <Toggle label="Email Notifications" on={s.emailNotifications} onChange={(v) => patch({ emailNotifications: v })} />
          </section>
        </div>
        <div className="settings-actions">
          <button className="btn btn-outline" type="button" onClick={() => setS({ ...DEFAULT_SETTINGS })}>
            Reset to Defaults
          </button>
          <button
            className="btn btn-accent"
            type="button"
            onClick={() => {
              saveSettings(s);
              if (wallet) void persistSettings(wallet.address, wallet.chain, s);
              onSave?.(s);
              onClose();
            }}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="setting-row">
      <span>{label}</span>
      <input className="slider" type="range" min={0} max={100} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="setting-row">
      <span>{label}</span>
      <button className={`toggle ${on ? "on" : ""}`} type="button" onClick={() => onChange(!on)} aria-pressed={on}>
        <i />
      </button>
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="setting-row">
      <span>{label}</span>
      <Dropdown
        ariaLabel={label}
        value={value}
        options={options.map((id) => ({ id, label: id }))}
        onChange={onChange}
      />
    </div>
  );
}
