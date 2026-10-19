import { Group, InstancedMesh, Matrix4, Mesh, Object3D, Vector3 } from "three";
import { RailwayPath } from "../flight/railway/path";
import {
  createScenery as createBaseScenery,
  seatOnGround,
  sceneryTime,
  updateLife,
  createFireflies,
} from "../flight/planet/scenery";
import { PlanetSurface } from "../flight/planet/surface";
import { cartToSph, sphToCart } from "../flight/math/sphere";
import { isDryLand, surfaceRadius, waterSurfaceRadius } from "./height";
import { createIslandTrees } from "./islandTrees";

export { sceneryTime, updateLife, createFireflies };

export function updateFireflies(group: Group, t: number): void {
  for (const child of group.children) {
    const u = child.userData;
    const theta = u.theta + Math.sin(t * 0.6 + u.phase) * 0.03;
    const phi = u.phi + Math.cos(t * 0.5 + u.phase) * 0.03;
    if (!isDryLand(theta, phi, 0.08)) {
      child.visible = false;
      continue;
    }
    child.visible = true;
    const r = surfaceRadius(theta, phi) + 0.4 + Math.sin(t * 1.4 + u.phase) * 0.25;
    child.position.copy(sphToCart(r, theta, phi));
    const vis = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 3 + u.phase));
    child.scale.setScalar(vis);
  }
}

const worldPos = new Vector3();
const mat = new Matrix4();

export function buildSailScenery(path: RailwayPath, surface: PlanetSurface): Group {
  const root = createBaseScenery(path);
  removeAirfield(root);
  seatOnGround(root, surface);
  clearFlightForest(root);
  cullFloodedInstances(root);
  hideFloodedMeshes(root);
  root.add(createIslandTrees());
  return root;
}

function clearFlightForest(root: Group): void {
  for (const child of root.children) {
    if (!(child as Group).isGroup) continue;
    const inst = child.children.filter((c) => (c as InstancedMesh).isInstancedMesh);
    if (inst.length < 6) continue;
    for (const mesh of inst) {
      (mesh as InstancedMesh).count = 0;
      (mesh as InstancedMesh).instanceMatrix.needsUpdate = true;
    }
    break;
  }
}

function cullFloodedInstances(root: Group): void {
  const waterR = waterSurfaceRadius();
  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    const mesh = obj as InstancedMesh;
    if (!mesh.isInstancedMesh) return;
    let kept = 0;
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, mat);
      worldPos.setFromMatrixPosition(mat);
      const sph = cartToSph(worldPos);
      if (!isDryLand(sph.theta, sph.phi, 0.14)) continue;
      if (worldPos.length() < waterR + 0.04) continue;
      if (kept !== i) mesh.setMatrixAt(kept, mat);
      kept++;
    }
    mesh.count = kept;
    mesh.instanceMatrix.needsUpdate = true;
  });
}

function hideFloodedMeshes(root: Group): void {
  const waterR = waterSurfaceRadius();
  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh || (mesh as InstancedMesh).isInstancedMesh) return;
    mesh.getWorldPosition(worldPos);
    if (worldPos.lengthSq() < 4) return;
    const sph = cartToSph(worldPos);
    if (!isDryLand(sph.theta, sph.phi, 0.1) || worldPos.length() < waterR) {
      hideBranch(mesh);
    }
  });
}

function hideBranch(obj: Object3D): void {
  obj.visible = false;
}

/** The flight world keeps its airfield. Sail drops the strip, terminal, and tower. */
function removeAirfield(root: Group): void {
  const gone: Object3D[] = [];
  root.traverse((obj) => {
    if (obj.name === "landing-strip") gone.push(obj);
  });
  for (const obj of gone) obj.removeFromParent();
  const actors = root.userData.life as { lamps?: Mesh[] } | undefined;
  if (actors?.lamps) actors.lamps.length = 0;
}
