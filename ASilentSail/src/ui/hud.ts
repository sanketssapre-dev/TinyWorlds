export type HudApi = {
  root: HTMLElement;
  refresh: () => void;
  dispose: () => void;
};

export function createHud(mount: HTMLElement, heroName: string, onNext: () => string): HudApi {
  mount.innerHTML = `
    <div class="chrome">
      <p class="flight-title">Tiny Worlds : A Silent Sail</p>
      <div class="scene-controls" role="group" aria-label="Scene controls">
        <button id="btn-view" class="btn scene-control" type="button" aria-label="Next yacht" title="Next yacht">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
            <path d="M4 7.5h3l1.5-2h7l1.5 2h3A1.5 1.5 0 0 1 21.5 9v9A1.5 1.5 0 0 1 20 19.5H4A1.5 1.5 0 0 1 2.5 18V9A1.5 1.5 0 0 1 4 7.5Z"/>
            <circle cx="12" cy="13.5" r="4"/>
          </svg>
        </button>
      </div>
    </div>
  `;

  const title = mount.querySelector(".flight-title") as HTMLElement;
  const viewBtn = mount.querySelector("#btn-view") as HTMLButtonElement;
  const show = (name: string) => {
    title.textContent = `Tiny Worlds : ${name}`;
    viewBtn.title = `Next yacht (${name})`;
    viewBtn.setAttribute("aria-label", `Next yacht, now ${name}`);
  };
  show(heroName);

  const onView = () => show(onNext());
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
