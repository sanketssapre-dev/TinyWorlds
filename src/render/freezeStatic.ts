import { Object3D } from "three";

/** These objects change their own transform every frame. */
const KEEP_SELF = new Set([
  "biplane",
  "propeller",
  "sailboat",
  "windmill-sails",
  "village-flames",
  "castle-flames",
  "clouds",
  "motes",
  "ancient-crown",
]);

/** These objects move, and so do their children. */
const KEEP_SUBTREE = new Set(["village-smoke", "fireflies", "grazing-sheep"]);

/** Bake a local matrix once for anything that never moves again. */
export function freezeStaticObjects(root: Object3D): void {
  const visit = (obj: Object3D, keepSubtree: boolean): void => {
    const subtree = keepSubtree || KEEP_SUBTREE.has(obj.name);
    if (!(subtree || KEEP_SELF.has(obj.name))) {
      obj.updateMatrix();
      obj.matrixAutoUpdate = false;
    }
    for (const child of obj.children) visit(child, subtree);
  };
  visit(root, false);
}
