import type { CameraRig } from "../camera/controller";
import { modeButtonLabel, toggleCameraMode } from "../camera/controller";

export type HudApi = {
  root: HTMLElement;
  refresh: () => void;
  dispose: () => void;
};

/** Two controls, matching the flights chrome: title bottom left, camera bottom right. */
export function createHud(mount: HTMLElement, rig: CameraRig): HudApi {
  mount.innerHTML = `
    <div class="chrome">
      <p class="flight-title">Tiny Worlds</p>
      <div class="scene-controls" role="group" aria-label="Scene controls">
        <button id="btn-camera" class="btn scene-control" type="button">
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

  const btn = mount.querySelector("#btn-camera") as HTMLButtonElement;
  const sync = () => {
    btn.setAttribute("aria-label", `Switch camera to ${modeButtonLabel(rig)}`);
  };
  sync();

  const onClick = () => {
    toggleCameraMode(rig);
    sync();
  };
  btn.addEventListener("click", onClick);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "c" || e.key === "C") onClick();
  };
  window.addEventListener("keydown", onKey);

  return {
    root: mount,
    refresh: sync,
    dispose: () => {
      window.removeEventListener("keydown", onKey);
      btn.removeEventListener("click", onClick);
    },
  };
}
