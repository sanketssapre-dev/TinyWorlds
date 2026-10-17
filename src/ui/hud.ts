import { CameraRig, cycleView } from "../camera/controller";

export type HudApi = {
  root: HTMLElement;
  refresh: () => void;
  dispose: () => void;
};

export function createHud(mount: HTMLElement, camera: CameraRig): HudApi {
  mount.innerHTML = `
    <div class="chrome">
      <p class="flight-title">Tiny Worlds : A Silent Flight</p>
      <button id="btn-view" class="btn switch-cam" type="button">Switch Camera</button>
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
    dispose: () => window.removeEventListener("keydown", onKey),
  };
}
