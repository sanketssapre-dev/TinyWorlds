import {
  ACESFilmicToneMapping,
  Clock,
  PCFSoftShadowMap,
  SRGBColorSpace,
  Scene,
  WebGLRenderer,
} from "three";
import { CAMERA, DEBUG } from "./config";
import { createCamera, notifyOrbit, snapCamera, updateCamera } from "./camera/controller";
import { createFlight, updateFlight } from "./flight/biplane";
import { createFlightPathMarkers } from "./debug/flightPathMarkers";
import { createPlanetMesh } from "./planet/mesh";
import {
  createFireflies,
  createScenery,
  sceneryTime,
  seatOnGround,
  updateFireflies,
  updateLife,
} from "./planet/scenery";
import { indexPlanetSurface } from "./planet/surface";
import { createBoats, updateBoats } from "./planet/boats";
import { createWater, updateWater } from "./planet/water";
import { createFlightPath, getSampleAt, scratchSample } from "./railway/path";
import { createEnvironment, updateClouds } from "./scene/environment";
import { freezeStaticObjects } from "./render/freezeStatic";
import { skipInvisibleDirectLight } from "./render/liveLights";
import { createHud } from "./ui/hud";

skipInvisibleDirectLight();

const canvas = document.querySelector<HTMLCanvasElement>("#world");
const hudRoot = document.querySelector<HTMLElement>("#hud");
const loader = document.querySelector<HTMLElement>("#loader");
const errorEl = document.querySelector<HTMLElement>("#error");

if (!canvas || !hudRoot) {
  throw new Error("Missing application mount points.");
}

try {
  start(canvas, hudRoot);
} catch (err) {
  showError(err);
}

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
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  const scene = new Scene();
  const cameraRig = createCamera(window.innerWidth / window.innerHeight);
  const env = createEnvironment(scene);
  scene.add(env);

  const selectedVariant = Math.floor(Math.random() * 3);
  const pathSeed = Math.floor(Math.random() * 0x7fffffff) + 1;
  const debugPaths = DEBUG.enabled
    ? [0, 1, 2].map((variant) => createFlightPath(768, pathSeed, variant))
    : undefined;
  const path = debugPaths
    ? debugPaths[selectedVariant]
    : createFlightPath(768, pathSeed, selectedVariant);
  const planet = createPlanetMesh();
  const surface = indexPlanetSurface(planet.geometry);
  const scenery = createScenery(path);
  seatOnGround(scenery, surface);
  const water = createWater();
  const boats = createBoats();
  const fireflies = createFireflies();
  const flight = createFlight();

  scene.add(planet, scenery, water, boats, fireflies, flight.craft);
  if (debugPaths) scene.add(createFlightPathMarkers(debugPaths));
  freezeStaticObjects(scene);

  const hud = createHud(hudMount, cameraRig);
  snapCamera(cameraRig, getSampleAt(path, flight.distance, scratchSample()));

  const clock = new Clock();
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch = 0;

  const onPointerDown = (e: PointerEvent) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size !== 2) return;
    const pts = [...pointers.values()];
    const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    if (pinch) {
      cameraRig.zoom = clamp(cameraRig.zoom * (pinch / d), CAMERA.minZoom, zoomMax(cameraRig.overhead));
      notifyOrbit(cameraRig);
    }
    pinch = d;
  };
  const onPointerUp = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = 0;
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    cameraRig.zoom = clamp(
      cameraRig.zoom + Math.sign(e.deltaY) * 0.55,
      CAMERA.minZoom,
      zoomMax(cameraRig.overhead),
    );
    notifyOrbit(cameraRig);
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
    updateFlight(flight, path, dt);
    const sample = getSampleAt(path, flight.distance, scratchSample());
    updateCamera(cameraRig, dt, sample);
    updateWater(dt);
    updateBoats(dt);
    sceneryTime.value += dt;
    updateClouds(env, dt);
    updateLife(scenery, clock.elapsedTime);
    updateFireflies(fireflies, clock.elapsedTime);
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

function zoomMax(overhead: boolean): number {
  return overhead ? CAMERA.maxOverheadZoom : CAMERA.maxZoom;
}

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
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
