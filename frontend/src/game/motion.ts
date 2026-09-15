import * as pc from "playcanvas";
import type { PreviewMotion } from "@the-block/shared";

export const SIT_HIP = 0.65;

export type CitizenMotion = PreviewMotion | "sit" | "punch" | "hit" | "fall" | "down" | "getup";

export function applyCitizenMotion(citizen: pc.Entity, motion: CitizenMotion, t: number): number {
  const armL = citizen.findByName("arm-l");
  const armR = citizen.findByName("arm-r");
  const legL = citizen.findByName("leg-l");
  const legR = citizen.findByName("leg-r");
  const torso = citizen.findByName("torso");
  armL?.setLocalEulerAngles(0, 0, 0);
  armR?.setLocalEulerAngles(0, 0, 0);
  legL?.setLocalEulerAngles(0, 0, 0);
  legR?.setLocalEulerAngles(0, 0, 0);
  torso?.setLocalEulerAngles(0, 0, 0);

  if (motion === "idle") {
    torso?.setLocalEulerAngles(Math.sin(t) * 2, 0, 0);
    return Math.sin(t * 2) * 0.03;
  }
  if (motion === "walk") {
    const swing = Math.sin(t * 8) * 32;
    armL?.setLocalEulerAngles(swing, 0, 0);
    armR?.setLocalEulerAngles(-swing, 0, 0);
    legL?.setLocalEulerAngles(-swing, 0, 0);
    legR?.setLocalEulerAngles(swing, 0, 0);
    return Math.abs(Math.sin(t * 8)) * 0.05;
  }
  if (motion === "sit") {
    legL?.setLocalEulerAngles(-88, 0, 0);
    legR?.setLocalEulerAngles(-88, 0, 0);
    armL?.setLocalEulerAngles(8, 0, -10);
    armR?.setLocalEulerAngles(8, 0, 10);
    torso?.setLocalEulerAngles(6 + Math.sin(t) * 1.5, 0, 0);
    return 0;
  }
  if (motion === "punch") {
    const p = Math.max(0, Math.min(1, t));
    const wind = p < 0.38 ? p / 0.38 : Math.max(0, 1 - (p - 0.38) / 0.62);
    armR?.setLocalEulerAngles(-20 - wind * 70, 18, 42);
    armL?.setLocalEulerAngles(-12, 0, -16);
    torso?.setLocalEulerAngles(10, -16 * wind, 0);
    return 0;
  }
  if (motion === "hit") {
    const p = Math.max(0, Math.min(1, t));
    torso?.setLocalEulerAngles(14 * (1 - p), 22 * (1 - p), 0);
    armL?.setLocalEulerAngles(-28, 0, -36);
    armR?.setLocalEulerAngles(-10, 0, 20);
    return 0;
  }
  if (motion === "fall") {
    const p = Math.max(0, Math.min(1, t));
    armL?.setLocalEulerAngles(-25 - p * 55, 0, -35 - p * 35);
    armR?.setLocalEulerAngles(-15 - p * 65, 0, 30 + p * 45);
    legL?.setLocalEulerAngles(p * 18, 0, -8);
    legR?.setLocalEulerAngles(-p * 12, 0, 10);
    torso?.setLocalEulerAngles(8 + p * 12, 0, 0);
    return 0;
  }
  if (motion === "down") {
    armL?.setLocalEulerAngles(-82, 0, -72);
    armR?.setLocalEulerAngles(-78, 0, 76);
    legL?.setLocalEulerAngles(16, 0, -8);
    legR?.setLocalEulerAngles(-10, 0, 10);
    torso?.setLocalEulerAngles(18, 0, 0);
    return 0;
  }
  if (motion === "getup") {
    const p = Math.max(0, Math.min(1, t));
    armL?.setLocalEulerAngles(-82 * (1 - p), 0, -72 * (1 - p));
    armR?.setLocalEulerAngles(-78 * (1 - p), 0, 76 * (1 - p));
    legL?.setLocalEulerAngles(16 * (1 - p), 0, -8 * (1 - p));
    legR?.setLocalEulerAngles(-10 * (1 - p), 0, 10 * (1 - p));
    torso?.setLocalEulerAngles(18 * (1 - p), 0, 0);
    return 0;
  }
  if (motion === "wave") {
    armR?.setLocalEulerAngles(-48, Math.sin(t * 10) * 28, 118);
    armL?.setLocalEulerAngles(-10, 0, -14);
    torso?.setLocalEulerAngles(0, Math.sin(t * 3) * 6, 0);
    return 0;
  }
  torso?.setLocalEulerAngles(0, Math.sin(t * 6) * 18, Math.sin(t * 4) * 8);
  armL?.setLocalEulerAngles(-42, 0, -78 - Math.sin(t * 8) * 18);
  armR?.setLocalEulerAngles(-42, 0, 78 + Math.sin(t * 8) * 18);
  return Math.abs(Math.sin(t * 8)) * 0.1;
}

/**
 * Overlays a two-handed ready stance on top of whatever the body is already
 * doing, so the legs keep walking while the weapon stays up. Call it after
 * applyCitizenMotion, which resets the limbs.
 *
 * `recoil` runs 1 -> 0 over a shot and kicks the arms up.
 */
export function applyAimPose(citizen: pc.Entity, t: number, recoil = 0) {
  const armL = citizen.findByName("arm-l");
  const armR = citizen.findByName("arm-r");
  const torso = citizen.findByName("torso");

  // Arms rotate about the shoulder; -90 points them straight ahead.
  const sway = Math.sin(t * 1.4) * 1.2;
  const kick = recoil * 22;
  armR?.setLocalEulerAngles(-88 - kick + sway, 0, 6);
  // The support hand comes across to meet it.
  armL?.setLocalEulerAngles(-72 - kick * 0.6 + sway, 0, -22);
  torso?.setLocalEulerAngles(2 + recoil * 4, 0, 0);
}
