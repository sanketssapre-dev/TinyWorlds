import { Object3D } from "three";

const KEEP_SELF = new Set([
  "biplane",
  "propeller",
  "sailboat",
  "windmill-sails",
  "village-flames",
  "castle-flames",
  "ancient-crown",
  "planet-world",
]);

const KEEP_SUBTREE = new Set([
  "village-smoke",
  "fireflies",
  "grazing-sheep",
  "yacht-fleet",
  "train-consist",
  "train",
  "steam",
]);

export function freezeStaticObjects(root: Object3D): void {
  const visit = (obj: Object3D, keepSubtree: boolean): void => {
    const subtree = keepSubtree || KEEP_SUBTREE.has(obj.name);
    if (!(subtree || KEEP_SELF.has(obj.name))) {
      if (obj.matrixAutoUpdate) obj.updateMatrix();
      obj.matrixAutoUpdate = false;
    }
    for (const child of obj.children) visit(child, subtree);
  };
  visit(root, false);
}
