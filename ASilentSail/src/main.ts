import {
  ACESFilmicToneMapping,
  Clock,
  Group,
  PCFSoftShadowMap,
  SRGBColorSpace,
  Scene,
  WebGLRenderer,
} from "three";
import {
  adjustSpinZoom,
  createCamera,
  snapCamera,
  updateCamera,
} from "./camera/controller";
import { createPlanetMesh } from "./planet/mesh";
import { buildAlpineScenery, sceneryTime, updateLife } from "./planet/scenery";
import { indexPlanetSurface } from "./planet/surface";
import { createWater, updateWater } from "./planet/water";
import { buildTrack } from "./railway/track";
import { createEnvironment } from "./scene/environment";
import { freezeStaticObjects } from "./render/freezeStatic";
import { skipInvisibleDirectLight } from "./render/liveLights";
import { createTrain } from "./train/consist";
import { createHud } from "./ui/hud";

skipInvisibleDirectLight();

const canvas = document.querySelector<HTMLCanvasElement>("#world");
const hudRoot = document.querySelector<HTMLElement>("#hud");
const loader = document.querySelector<HTMLElement>("#loader");
const errorEl = document.querySelector<HTMLElement>("#error");

if (!canvas || !hudRoot) {
  throw new Error("Missing application mount points.");
}

// Let the loader paint first — planet/track build is heavy and used to freeze a black tab.
requestAnimationFrame(() => {
  try {
    start(canvas, hudRoot);
  } catch (err) {
    showError(err);
  }
});

function start(canvasEl: HTMLCanvasElement, hudMount: HTMLElement): void {
  const renderer = new WebGLRenderer({
    canvas: canvasEl,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.setClearColor(0x04050a, 1);

  const scene = new Scene();
  const env = createEnvironment(scene);
  scene.add(env);

  // Planet-attached content rotates together in Free Planet Spin.
  // Moon / stars / sun stay in `env` (world space).
  const planetWorld = new Group();
  planetWorld.name = "planet-world";

  const planet = createPlanetMesh();
  const surface = indexPlanetSurface(planet.geometry);
  const train = createTrain(surface);
  const track = buildTrack(train.path);
  const scenery = buildAlpineScenery(surface, train.path);
  const water = createWater();

  planetWorld.add(planet, track, scenery, water, train.root);
  scene.add(planetWorld);

  // Freeze static meshes only — planet-world and train must keep matrix updates.
  freezeStaticObjects(planet);
  freezeStaticObjects(track);
  freezeStaticObjects(scenery);
  freezeStaticObjects(water);

  const cameraRig = createCamera(window.innerWidth / window.innerHeight, planetWorld);
  const first = train.update(0);
  snapCamera(cameraRig, first);

  const hud = createHud(hudMount, cameraRig);

  const clock = new Clock();
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch = 0;

  const onPointerDown = (e: PointerEvent) => {
    // Capture for pinch-zoom only — no drag-orbit
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size !== 2 || cameraRig.mode !== "freePlanetSpin") return;
    const pts = [...pointers.values()];
    const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    if (pinch) {
      const factor = pinch / d;
      adjustSpinZoom(cameraRig, (factor - 1) * cameraRig.spinZoom * 0.85);
    }
    pinch = d;
  };
  const onPointerUp = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = 0;
  };
  const onWheel = (e: WheelEvent) => {
    if (cameraRig.mode !== "freePlanetSpin") return;
    e.preventDefault();
    adjustSpinZoom(cameraRig, Math.sign(e.deltaY) * 4.2);
  };

  canvasEl.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  canvasEl.addEventListener("wheel", onWheel, { passive: false });

  const onResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    cameraRig.camera.aspect = w / h;
    cameraRig.camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  };
  window.addEventListener("resize", onResize);

  const loop = () => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const sample = train.update(dt);
    // Keep planet matrix current before camera reads world transforms
    planetWorld.updateMatrixWorld(true);
    updateCamera(cameraRig, dt, sample);
    updateWater(dt);
    sceneryTime.value += dt;
    updateLife(scenery, clock.elapsedTime);
    hud.refresh();
    renderer.render(scene, cameraRig.camera);
    requestAnimationFrame(loop);
  };

  loader?.setAttribute("hidden", "");
  requestAnimationFrame(loop);

  window.addEventListener("beforeunload", () => {
    hud.dispose();
    renderer.dispose();
  });
}

function showError(err: unknown): void {
  loader?.setAttribute("hidden", "");
  if (errorEl) {
    errorEl.hidden = false;
    errorEl.textContent =
      "The little world failed to awaken.\n" +
      (err instanceof Error ? err.message : String(err));
  }
  console.error(err);
}
