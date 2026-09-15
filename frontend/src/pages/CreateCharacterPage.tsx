import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
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
} from "@the-block/shared";
import { Dropdown } from "../components/Dropdown";
import { Header } from "../components/Header";
import { CharacterPreview } from "../game/preview";
import { saveCharacter, persistCharacter, loadCharacterForWallet } from "../lib/storage";
import { useWallet } from "../state/WalletStore";

export function CreateCharacterPage() {
  const nav = useNavigate();
  const { wallet } = useWallet();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const preview = useRef<CharacterPreview | null>(null);
  const [name, setName] = useState("");
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
      credits: 500,
      inventory: seedInventory(accessories),
      equippedGun: null,
      equippedPet: null,
      createdAt: new Date().toISOString(),
    };
    saveCharacter(record, wallet.chain);
    await persistCharacter(record, wallet.chain);
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
              <span className="counter">{name.length} / 16</span>
            </div>
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
          <button className="btn btn-accent" type="submit" disabled={!wallet} style={{ width: "100%", padding: "14px" }}>
            Create Character
          </button>
        </form>
      </div>
    </div>
  );
}
