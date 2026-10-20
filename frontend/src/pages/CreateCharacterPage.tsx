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
} from "@moonville/shared";
import { Dropdown } from "../components/Dropdown";
import { Header } from "../components/Header";
import { CharacterPreview } from "../game/preview";
import { saveCharacter, persistCharacter, loadCharacterForWallet } from "../lib/storage";
import { useSession } from "../state/SessionStore";

export function CreateCharacterPage() {
  const nav = useNavigate();
  const { session, openLink } = useSession();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const preview = useRef<CharacterPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
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
  const city = session?.city ?? "trenches";

  // No account, no character: send them to sign up first. A character that
  // already exists goes straight to the game.
  useEffect(() => {
    if (!session) {
      nav("/login", { replace: true });
      return;
    }
    if (loadCharacterForWallet(session.playerId, session.chain)) nav("/play", { replace: true });
  }, [session, nav]);

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
    if (!session) return;
    const record: CharacterRecord = {
      id: crypto.randomUUID(),
      wallet: session.playerId,
      // The username is the nametag; the server enforces this too.
      displayName: session.username,
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
      moon: 0,
      inventory: seedInventory(accessories),
      equippedGun: null,
      equippedPet: null,
      createdAt: new Date().toISOString(),
    };
    setSaving(true);
    const failure = session.demo ? null : await persistCharacter(record, session.chain);
    setSaving(false);
    if (failure) {
      // Saving locally first would leave the browser holding a character the
      // server never accepted.
      setError(failure);
      return;
    }
    saveCharacter(record, session.chain);
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
          <p className="lede">Your look is yours to change. Everyone starts in the Trenches - buy a home there to open Bagtown.</p>

          <div className="field">
            <label>NAMETAG</label>
            <div className="nametag-preview">
              <span>{session?.username ?? "…"}</span>
              <small>Your username. Everyone in the city sees it.</small>
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

          <div className="city-lock" style={{ borderColor: CITIES[city].accent }}>
            <strong style={{ color: CITIES[city].accent }}>{CITIES[city].name}</strong>
            <span>
              {session?.solanaAddress
                ? `${(session.balance ?? 0).toLocaleString()} $MOON held`
                : "No wallet linked"}
            </span>
          </div>
          <p className="lock-note">
            Everyone starts in the Trenches. Each home you buy opens the next district up; link a Solana wallet to buy one
            {session && !session.demo && !session.solanaAddress && (
              <>
                {" "}-{" "}
                <button type="button" className="link-btn" onClick={() => void openLink()}>
                  link one now
                </button>
              </>
            )}
            . It is optional and you can do it any time.
          </p>
          {error && <p className="field-error">{error}</p>}
          <button
            className="btn btn-accent"
            type="submit"
            disabled={!session || saving}
            style={{ width: "100%", padding: "14px" }}
          >
            {saving ? "Saving…" : "Enter the city"}
          </button>
        </form>
      </div>
    </div>
  );
}
