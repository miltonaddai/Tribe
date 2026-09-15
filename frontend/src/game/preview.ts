import * as pc from "playcanvas";
import type { PreviewMotion } from "@the-block/shared";
import { createPcApp, destroyPcApp, box } from "./pcApp";
import { createCitizen, type Appearance } from "./character";
import { applyCitizenMotion } from "./motion";

/** Top face of the glow platform: 0.06 centre + half of its 0.04 height. */
const STAGE_TOP = 0.08;

export class CharacterPreview {
  private app: pc.AppBase | null = null;
  private citizen: pc.Entity | null = null;
  private parent: pc.Entity | null = null;
  private motion: PreviewMotion = "idle";
  private t = 0;
  private generation = 0;

  async start(canvas: HTMLCanvasElement, appearance: Appearance) {
    const gen = ++this.generation;
    const app = await createPcApp(canvas);
    if (gen !== this.generation) {
      destroyPcApp(app);
      return;
    }
    this.app = app;
    this.app.scene.ambientLight = new pc.Color(0.55, 0.55, 0.6);

    const sun = new pc.Entity("sun");
    sun.addComponent("light", {
      type: "directional",
      color: new pc.Color(1, 0.95, 0.8),
      intensity: 1.2,
      castShadows: false,
    });
    sun.setEulerAngles(50, 30, 0);
    this.app.root.addChild(sun);

    const fill = new pc.Entity("fill");
    fill.addComponent("light", {
      type: "directional",
      color: new pc.Color(0.55, 0.65, 0.9),
      intensity: 0.35,
      castShadows: false,
    });
    fill.setEulerAngles(20, -120, 0);
    this.app.root.addChild(fill);

    box(this.app.root, "floor", [0, 0, 0], [4, 0.08, 4], "#161616");
    box(this.app.root, "glow", [0, 0.06, 0], [1.6, 0.04, 1.6], "#FFB830", { emissive: "#FFB830", intensity: 2 });

    this.parent = new pc.Entity("spin");
    this.app.root.addChild(this.parent);
    this.citizen = createCitizen(this.parent, appearance, "preview");

    const camera = new pc.Entity("cam");
    camera.addComponent("camera", { clearColor: new pc.Color(0.06, 0.06, 0.06), fov: 32 });
    camera.setPosition(0, 2.1, 5.4);
    camera.lookAt(0, 1.2, 0);
    this.app.root.addChild(camera);

    this.app.on("update", (dt: number) => {
      this.t += dt;
      this.applyMotion(dt);
    });
  }

  refresh(appearance: Appearance) {
    if (!this.app || !this.parent) return;
    this.citizen?.destroy();
    this.citizen = createCitizen(this.parent, appearance, "preview");
  }

  setMotion(motion: PreviewMotion) {
    this.motion = motion;
    this.t = 0;
  }

  dispose() {
    this.generation += 1;
    if (this.app) destroyPcApp(this.app);
    this.app = null;
    this.citizen = null;
    this.parent = null;
  }

  private applyMotion(dt: number) {
    if (!this.parent || !this.citizen) return;

    if (this.motion === "idle") {
      this.parent.rotate(0, dt * 28, 0);
    } else {
      const y = this.parent.getEulerAngles().y;
      this.parent.setEulerAngles(0, y * Math.max(0, 1 - dt * 5), 0);
    }

    const t = this.t;
    const bob = applyCitizenMotion(this.citizen, this.motion, t);
    this.citizen.setLocalPosition(0, STAGE_TOP + bob, 0);
  }
}
