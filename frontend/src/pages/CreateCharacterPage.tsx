import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  checkName,
  nameProblemText,
  ACCESSORIES,
  CITIES,
  HEADWEAR,
  OUTFITS,
  PREVIEW_MOTIONS,
  PANT_COLORS,
  SHOE_COLORS,
  SHOES,
  SKIN_TONES,
  seedInventory,
  type AccessoryId,
  type BodyType,
  type CharacterRecord,
  type HeadwearId,
  type OutfitId,
  type PreviewMotion,
  type ShoeId,
} from "@tribe/shared";
import { Dropdown } from "../components/Dropdown";
import { Header } from "../components/Header";
import { CharacterPreview } from "../game/preview";
import { checkNameAvailable, saveCharacter, persistCharacter, loadCharacterForWallet } from "../lib/storage";
import { useWallet } from "../state/WalletStore";

export function CreateCharacterPage() {
  const nav = useNavigate();
  const { wallet } = useWallet();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const preview = useRef<CharacterPreview | null>(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameStatus, setNameStatus] = useState<"idle" | "checking" | "ok" | "error">("idle");
  const [saving, setSaving] = useState(false);
  // Read inside the debounce to check the reply still matches the box.
  const nameRef = useRef(name);
  nameRef.current = name;
  const [bodyType, setBodyType] = useState<BodyType>("regular");
  const [skin, setSkin] = useState(SKIN_TONES[2]);
  const [outfit, setOutfit] = useState<OutfitId>("hi-vis");
  const [pantsColor, setPantsColor] = useState(PANT_COLORS[0]);
  const [shoe, setShoe] = useState<ShoeId>("sneakers");
  const [shoeColor, setShoeColor] = useState(SHOE_COLORS[0]);
  const [headwear, setHeadwear] = useState<HeadwearId>("hardhat");
  const [accessories, setAccessories] = useState<AccessoryId[]>([]);
  const [motion, setMotion] = useState<PreviewMotion>("idle");

  const appearance = { bodyType, skinTone: skin, outfit, pantsColor, shoe, shoeColor, headwear, accessories };
  const city = wallet?.city ?? "trench";
  const balance = wallet?.balance;
  const symbol = wallet?.symbol ?? "ETH";

  useEffect(() => {
    if (!wallet) return;
    if (loadCharacterForWallet(wallet.address, wallet.chain)) nav("/play", { replace: true });
  }, [wallet, nav]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const p = new CharacterPreview();
    preview.current = p;
    void p.start(canvas, appearance);
    return () => p.dispose();
    // initial mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    preview.current?.refresh(appearance);
  }, [bodyType, skin, outfit, pantsColor, shoe, shoeColor, headwear, accessories]);

  useEffect(() => {
    preview.current?.setMotion(motion);
  }, [motion]);

  function toggleAccessory(id: AccessoryId) {
    setAccessories((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));
  }

  // Checked as it is typed so a collision surfaces before the form is submitted.
  useEffect(() => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(null);
      setNameStatus("idle");
      return;
    }
    const problem = checkName(trimmed);
    if (problem) {
      setNameError(nameProblemText(problem));
      setNameStatus("error");
      return;
    }
    setNameError(null);
    if (!wallet) {
      setNameStatus("idle");
      return;
    }
    // Shape is fine; the server has the last word on whether it is free.
    setNameStatus("checking");
    // Debounced: one request per pause, not one per keystroke.
    const timer = window.setTimeout(() => {
      void checkNameAvailable(trimmed, wallet.address, wallet.chain).then((r) => {
        // Ignore a late reply for a name that is no longer in the box.
        if (trimmed !== nameRef.current.trim()) return;
        setNameError(r.reason);
        setNameStatus(r.available ? "ok" : "error");
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [name, wallet]);

  async function create() {
    if (!wallet) return;
    const record: CharacterRecord = {
      id: crypto.randomUUID(),
      wallet: wallet.address,
      displayName: name.trim().slice(0, 16) || "trenchrat",
      bodyType,
      skinTone: skin,
      outfit,
      pantsColor,
      shoe,
      shoeColor,
      headwear,
      accessories,
      homeCity: city,
      accessTier: CITIES[city].tier,
      brokemeter: 100,
      // Balance comes from the wallet, not from character creation.
      tribute: 0,
      inventory: seedInventory(accessories),
      equippedGun: null,
      equippedPet: null,
      createdAt: new Date().toISOString(),
    };
    setSaving(true);
    const failure = await persistCharacter(record, wallet.chain);
    setSaving(false);
    if (failure) {
      // Names are unique, so this can legitimately refuse. Saving locally first
      // would leave the browser holding a name the server rejected.
      setNameError(failure);
      return;
    }
    saveCharacter(record, wallet.chain);
    nav("/play");
  }

  return (
    <div className="create-page">
      <Header solid />
      <div className="create-grid">
        <div className="preview-wrap">
          <canvas ref={canvasRef} />
          <div className="preview-label">LIVE PREVIEW</div>
        </div>
        <form
          className="create-form"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <h1>Create your character</h1>
          <p className="lede">Your look is yours. Your city isn&apos;t — that&apos;s set by your wallet balance.</p>

          <div className="field">
            <label>DISPLAY NAME</label>
            <div className="input-wrap">
              <input
                className="input"
                maxLength={16}
                placeholder="e.g. trenchrat"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <span className="input-status">
                {nameStatus === "checking" && <span className="name-checking" aria-hidden />}
                {nameStatus === "ok" && (
                  // Keyed on the name so the draw-on replays for each new name
                  // that clears, rather than only the first.
                  <svg
                    key={name.trim()}
                    className="name-ok"
                    viewBox="0 0 24 24"
                    width="17"
                    height="17"
                    role="img"
                    aria-label="Name available"
                  >
                    <circle className="name-ok-ring" cx="12" cy="12" r="10" />
                    <path className="name-ok-tick" d="M7 12.4l3.3 3.3L17.2 8.8" />
                  </svg>
                )}
                <span className="counter">{name.length} / 16</span>
              </span>
            </div>
            {nameError && <p className="field-error">{nameError}</p>}
          </div>

          <div className="field">
            <label>BODY TYPE</label>
            <div className="segmented">
              {(["slim", "regular", "broad"] as BodyType[]).map((b) => (
                <button key={b} type="button" className={bodyType === b ? "on" : ""} onClick={() => setBodyType(b)}>
                  {b}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>SKIN TONE</label>
            <div className="swatches">
              {SKIN_TONES.map((tone) => (
                <button
                  key={tone}
                  type="button"
                  className={`swatch ${skin === tone ? "on" : ""}`}
                  style={{ background: tone }}
                  onClick={() => setSkin(tone)}
                />
              ))}
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label>OUTFIT</label>
              <Dropdown
                ariaLabel="Outfit"
                value={outfit}
                options={OUTFITS}
                onChange={setOutfit}
              />
            </div>
            <div className="field">
              <label>HEADWEAR</label>
              <Dropdown
                ariaLabel="Headwear"
                value={headwear}
                options={HEADWEAR}
                onChange={setHeadwear}
              />
            </div>
          </div>

          <div className="field">
            <label>PANTS COLOR</label>
            <div className="swatches">
              {PANT_COLORS.map((tone) => (
                <button
                  key={tone}
                  type="button"
                  className={`swatch ${pantsColor === tone ? "on" : ""}`}
                  style={{ background: tone }}
                  onClick={() => setPantsColor(tone)}
                />
              ))}
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label>SHOES</label>
              <Dropdown ariaLabel="Shoes" value={shoe} options={SHOES} onChange={setShoe} />
            </div>
            <div className="field">
              <label>SHOE COLOR</label>
              <div className="swatches">
                {SHOE_COLORS.map((tone) => (
                  <button
                    key={tone}
                    type="button"
                    className={`swatch ${shoeColor === tone ? "on" : ""}`}
                    style={{ background: tone }}
                    onClick={() => setShoeColor(tone)}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="field">
            <label>ACCESSORIES</label>
            <div className="chip-row">
              {ACCESSORIES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`chip ${accessories.includes(item.id) ? "on" : ""}`}
                  onClick={() => toggleAccessory(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>FIT MOTION</label>
            <div className="segmented motions">
              {PREVIEW_MOTIONS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={motion === item.id ? "on" : ""}
                  onClick={() => setMotion(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="city-lock" style={{ borderColor: wallet ? CITIES[city].accent : "#555" }}>
            <strong style={{ color: wallet ? CITIES[city].accent : "#888" }}>
              {wallet ? CITIES[city].name : "No wallet"}
            </strong>
            <span>
              {wallet && balance != null ? `LOCKED — ${balance.toFixed(4)} ${symbol}` : "Connect wallet"}
            </span>
          </div>
          <p className="lock-note">
            Set by your connected wallet balance. Work your way up in-game — you cannot buy your way into a
            wealthier city.
          </p>
          <button
            className="btn btn-accent"
            type="submit"
            disabled={!wallet || saving || Boolean(nameError)}
            style={{ width: "100%", padding: "14px" }}
          >
            Create Character
          </button>
        </form>
      </div>
    </div>
  );
}
