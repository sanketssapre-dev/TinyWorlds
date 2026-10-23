import { CameraRig, cycleView } from "../camera/controller";

export type HudApi = {
  root: HTMLElement;
  refresh: () => void;
  dispose: () => void;
};

export function createHud(
  mount: HTMLElement,
  camera: CameraRig,
): HudApi {
  mount.innerHTML = `
    <div class="chrome">
      <p class="flight-title">Tiny Worlds</p>
      <div class="scene-controls" role="group" aria-label="Scene controls">
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
    dispose: () => {
      window.removeEventListener("keydown", onKey);
      viewBtn.removeEventListener("click", onView);
    },
  };
}
