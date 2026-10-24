import { CameraRig, cycleView } from "../camera/controller";
import type { FlightMode } from "../flight/biplane";

export type HudApi = {
  root: HTMLElement;
  refresh: () => void;
  setMode: (mode: FlightMode) => void;
  dispose: () => void;
};

export function createHud(
  mount: HTMLElement,
  camera: CameraRig,
  onModeChange: (mode: FlightMode) => void,
): HudApi {
  mount.innerHTML = `
    <div class="chrome">
      <p class="flight-title">Tiny Worlds</p>
      <div class="scene-controls" role="group" aria-label="Scene controls">
        <button id="btn-mode" class="btn scene-control" type="button" aria-label="Autopilot">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"/>
            <path d="M7 9.5v3M5.5 11h3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <circle cx="15.4" cy="10.4" r="1.05" fill="none" stroke="currentColor" stroke-width="1.4"/>
            <circle cx="17.8" cy="12.6" r="1.05" fill="none" stroke="currentColor" stroke-width="1.4"/>
          </svg>
        </button>
        <button id="btn-view" class="btn scene-control" type="button" aria-label="Switch camera">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
            <circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/>
            <line x1="12" y1="15" x2="12" y2="16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="10" y1="12" x2="14" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  `;

  // On a touch device, say once how to fly. It fades on its own so the frame
  // settles back to nothing.
  const hint = document.createElement("p");
  hint.className = "touch-hint";
  hint.textContent = "drag to steer · pinch to zoom";
  mount.appendChild(hint);

  const showHint = () => {
    hint.classList.add("show");
    window.setTimeout(() => hint.classList.add("fade"), 3000);
  };
  if (window.matchMedia("(pointer: coarse)").matches) {
    window.addEventListener("touchstart", showHint, { passive: true, once: true });
  }

  // Which way the craft is flown.
  const modeBtn = mount.querySelector("#btn-mode") as HTMLButtonElement;

  const setMode = (mode: FlightMode) => {
    modeBtn.dataset.mode = mode;
    modeBtn.setAttribute("aria-label", mode === "autopilot" ? "Autopilot" : "Manual flight");
  };

  const onToggleMode = () => {
    onModeChange(modeBtn.dataset.mode === "autopilot" ? "manual" : "autopilot");
  };
  modeBtn.addEventListener("click", onToggleMode);
  setMode("autopilot");

  const viewBtn = mount.querySelector("#btn-view") as HTMLButtonElement;
  const onView = () => cycleView(camera);
  viewBtn.addEventListener("click", onView);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "c" || e.key === "C") onView();
  };
  window.addEventListener("keydown", onKey);

  return {
    root: mount,
    refresh: () => {},
    setMode,
    dispose: () => {
      window.removeEventListener("keydown", onKey);
      viewBtn.removeEventListener("click", onView);
      modeBtn.removeEventListener("click", onToggleMode);
      window.removeEventListener("touchstart", showHint);
    },
  };
}
