import { expect, it } from "vitest";
import { createScenery } from "../flight/planet/scenery";
import { indexPlanetSurface } from "../flight/planet/surface";
import { createSailPath, FLEET_ROUTES } from "../sail/path";
import { createPlanetMesh } from "./mesh";
import { buildSailScenery } from "./scenery";

const AIRFIELD = ["landing-strip", "airstrip-terminal", "airstrip-control-tower", "windsock"];

function airfieldNames(root: { traverse: (cb: (obj: { name: string }) => void) => void }): string[] {
  const found: string[] = [];
  root.traverse((obj) => {
    if (AIRFIELD.includes(obj.name)) found.push(obj.name);
  });
  return found;
}

it("drops the airstrip, terminal, and control tower from the sail world", () => {
  const path = createSailPath(64, FLEET_ROUTES[0]);
  const surface = indexPlanetSurface(createPlanetMesh().geometry);
  const sail = buildSailScenery(path, surface);
  expect(airfieldNames(sail)).toEqual([]);
  const actors = sail.userData.life as { lamps: unknown[] };
  expect(actors.lamps).toHaveLength(0);
});

it("keeps the airstrip on the flight world", () => {
  const path = createSailPath(64, FLEET_ROUTES[0]);
  const flight = createScenery(path);
  const found = airfieldNames(flight);
  expect(found).toContain("landing-strip");
  expect(found).toContain("airstrip-terminal");
  expect(found).toContain("airstrip-control-tower");
  expect(found).toContain("windsock");
  const actors = flight.userData.life as { lamps: unknown[] };
  expect(actors.lamps.length).toBeGreaterThan(0);
});
