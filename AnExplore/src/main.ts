import {
  ACESFilmicToneMapping,
  Clock,
  Group,
  InstancedMesh,
  Object3D,
  PCFSoftShadowMap,
  SRGBColorSpace,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { CAMERA, DEBUG } from "./config";
import { createCamera, notifyOrbit, snapCamera, updateCamera } from "./camera/controller";
import { createFlight, enterAutopilot, exitAutopilot, updateAutopilot, updateFlight } from "./flight/biplane";
import type { FlightMode } from "./flight/biplane";
import { createFlightPathMarkers } from "./debug/flightPathMarkers";
import { createAutopilotPath, getSampleAt, scratchSample, traceRoute } from "./flight/path";
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
import {
  createEnvironment,
  createPlanetaryRings,
  updatePlanetaryRings,
} from "./scene/environment";
import { freezeStaticObjects } from "./render/freezeStatic";
import { skipInvisibleDirectLight } from "./render/liveLights";
import { createHud } from "./ui/hud";
import { mapStick } from "./input/virtualStick";

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

  // The world's route: one of the original app's three, shifted once by a fresh
  // seed each visit, so no two visits fly quite the same line. Autopilot
  // follows it; in manual the craft leaves it and owns its own heading.
  const route = createAutopilotPath(768, undefined, Math.floor(Math.random() * 3));
  const flight = createFlight(getSampleAt(route, 0, scratchSample()));

  /** A camera sample taken from the craft itself: flight-centric, always. */
  const cameraSample = scratchSample();
  function craftSample(): typeof cameraSample {
    cameraSample.position.copy(flight.craft.position);
    cameraSample.tangent.copy(flight.heading);
    cameraSample.normal.copy(flight.dir);
    cameraSample.binormal.crossVectors(cameraSample.tangent, cameraSample.normal).normalize();
    return cameraSample;
  }

  // Who is flying. Autopilot is how the world opens — the original app's
  // ambient behaviour — and manual is the explorative one.
  let mode: FlightMode = "autopilot";
  const planet = createPlanetMesh(flight.searchLight);
  const surface = indexPlanetSurface(planet.geometry);
  const scenery = createScenery(route);
  seatOnGround(scenery, surface);
  const water = createWater();
  const boats = createBoats();
  const fireflies = createFireflies();

  scene.add(planet, scenery, water, boats, fireflies, flight.craft);
  snapCamera(cameraRig, craftSample());
  const planetaryRings = createPlanetaryRings();
  scene.add(planetaryRings);
  freezeStaticObjects(scene);

  // With ?pathdebug the live route is drawn. In autopilot that is the route
  // being flown; in manual it is the one the craft is making, so you can watch
  // it swing as you steer.
  const ROUTE_INTERVAL = 1 / 15;
  let routeMarkers: Group | null = null;
  let routeMarkerCount = 0;
  let drawn = route;
  let routeAge = 0;
  if (DEBUG.enabled) {
    routeMarkers = createFlightPathMarkers([route]);
    routeMarkerCount =
      (routeMarkers.children[0] as InstancedMesh).count +
      (routeMarkers.children[1] as InstancedMesh).count;
    scene.add(routeMarkers);
  }

  function refreshRoute(dt: number) {
    if (!routeMarkers) return;
    routeAge += dt;
    if (routeAge < ROUTE_INTERVAL) return;
    routeAge = 0;

    drawn = mode === "autopilot" ? route : traceRoute(flight.dir, flight.heading, 512);
    const dots = routeMarkers.children[0] as InstancedMesh;
    const dashes = routeMarkers.children[1] as InstancedMesh;
    const marker = new Object3D();
    const axisY = new Vector3(0, 1, 0);
    for (let i = 0; i < routeMarkerCount; i++) {
      const sample = getSampleAt(drawn, (i / routeMarkerCount) * drawn.totalLength, scratchSample());
      marker.position.copy(sample.position).addScaledVector(sample.normal, 0.18);
      marker.scale.setScalar(1);
      if (i % 2 === 0) {
        marker.quaternion.identity();
        marker.updateMatrix();
        dots.setMatrixAt(i / 2, marker.matrix);
      } else {
        marker.quaternion.setFromUnitVectors(axisY, sample.tangent);
        marker.updateMatrix();
        dashes.setMatrixAt((i - 1) / 2, marker.matrix);
      }
    }
    dots.instanceMatrix.needsUpdate = true;
    dashes.instanceMatrix.needsUpdate = true;
  }

  const hud = createHud(hudMount, cameraRig, setMode);

  /** Hand the craft between the route and the pilot, and say so on the HUD. */
  function setMode(next: FlightMode): void {
    if (next === mode) return;
    mode = next;
    if (next === "autopilot") enterAutopilot(flight);
    else exitAutopilot(flight);
    hud.setMode(next);
  }

  const clock = new Clock();
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch = 0;
  let steerPointer = -1;
  let steerOrigin = { x: 0, y: 0 };

  // Deliberate flight: left/right steer, up/down ask for a little more height.
  let turnInput = 0;
  let climbInput = 0;
  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") { turnInput = -1; e.preventDefault(); }
    if (e.key === "ArrowRight") { turnInput = 1; e.preventDefault(); }
    if (e.key === "ArrowUp") { climbInput = 1; e.preventDefault(); }
    if (e.key === "ArrowDown") { climbInput = -1; e.preventDefault(); }
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") turnInput = 0;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") climbInput = 0;
  });

  // A and M are the same toggle as the HUD button.
  window.addEventListener("keydown", (e) => {
    if (e.key === "a" || e.key === "A") setMode("autopilot");
    if (e.key === "m" || e.key === "M") setMode("manual");
  });

  const onPointerDown = (e: PointerEvent) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    // A single finger or stylus is the steering drag. The mouse is left out so
    // desktop behaviour is exactly what it was.
    if (pointers.size === 1 && e.pointerType !== "mouse") {
      steerPointer = e.pointerId;
      steerOrigin = { x: e.clientX, y: e.clientY };
    }
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2) {
      const pts = [...pointers.values()];
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (pinch) {
        cameraRig.zoom = clamp(
          cameraRig.zoom * (pinch / d),
          zoomMin(cameraRig.overhead),
          zoomMax(cameraRig.overhead),
        );
        notifyOrbit(cameraRig);
      }
      pinch = d;
      return;
    }

    if (e.pointerId !== steerPointer) return;
    // Offset from where the drag landed, like a stick: neutral at the centre,
    // full deflection at the edge. Dragging up on the screen is a climb.
    turnInput = mapStick(e.clientX - steerOrigin.x);
    climbInput = mapStick(steerOrigin.y - e.clientY);
  };
  const endPointer = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (e.pointerId === steerPointer) {
      steerPointer = -1;
      turnInput = 0;
      climbInput = 0;
    }
    if (pointers.size < 2) pinch = 0;
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    cameraRig.zoom = clamp(
      cameraRig.zoom + Math.sign(e.deltaY) * 1.1,
      zoomMin(cameraRig.overhead),
      zoomMax(cameraRig.overhead),
    );
    notifyOrbit(cameraRig);
  };

  canvasEl.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", endPointer);
  window.addEventListener("pointercancel", endPointer);
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
    if (mode === "autopilot") updateAutopilot(flight, route, dt);
    else updateFlight(flight, dt, turnInput, climbInput);
    updateCamera(cameraRig, dt, craftSample());
    refreshRoute(dt);
    updateWater(dt);
    updateBoats(dt);
    sceneryTime.value += dt;
    updatePlanetaryRings(planetaryRings, dt, cameraRig.camera.position.length());
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

function zoomMin(overhead: boolean): number {
  return overhead ? CAMERA.minOverheadZoom : CAMERA.minZoom;
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
