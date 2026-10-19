import {
  CylinderGeometry,
  Group,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  SphereGeometry,
  Vector3,
} from "three";
import { RailwayPath, getSampleAt, scratchSample } from "../railway/path";

const MARKER_SPACING = 0.75;
const FLOAT_HEIGHT = 0.18;
const AXIS_Y = new Vector3(0, 1, 0);
const COLORS = [0x42d9ff, 0xffd166, 0xff718d];
const dotGeometry = new SphereGeometry(0.07, 8, 6);
const dashGeometry = new CylinderGeometry(0.02, 0.02, 0.24, 6);

/** Temporary, color-coded markers for comparing all flight route variants. */
export function createFlightPathMarkers(paths: readonly RailwayPath[]): Group {
  const root = new Group();
  root.name = "flight-path-debug-markers";

  paths.forEach((path, variant) => {
    const count = Math.max(2, Math.floor(path.totalLength / MARKER_SPACING));
    const dotCount = Math.ceil(count / 2);
    const dashCount = Math.floor(count / 2);
    const material = new MeshBasicMaterial({
      color: COLORS[variant % COLORS.length],
      depthWrite: false,
      toneMapped: false,
      transparent: true,
      opacity: 0.2,
    });
    const dots = new InstancedMesh(dotGeometry, material, dotCount);
    const dashes = new InstancedMesh(dashGeometry, material, dashCount);
    dots.name = `flight-route-${variant + 1}-dots`;
    dashes.name = `flight-route-${variant + 1}-dashes`;

    const marker = new Object3D();
    for (let i = 0; i < count; i++) {
      const sample = getSampleAt(path, (i / count) * path.totalLength, scratchSample());
      marker.position.copy(sample.position).addScaledVector(sample.normal, FLOAT_HEIGHT);
      if (i % 2 === 0) {
        marker.scale.setScalar(1);
        marker.quaternion.identity();
        marker.updateMatrix();
        dots.setMatrixAt(i / 2, marker.matrix);
      } else {
        marker.quaternion.setFromUnitVectors(AXIS_Y, sample.tangent);
        marker.updateMatrix();
        dashes.setMatrixAt((i - 1) / 2, marker.matrix);
      }
    }

    dots.instanceMatrix.needsUpdate = true;
    dashes.instanceMatrix.needsUpdate = true;
    dots.computeBoundingSphere();
    dashes.computeBoundingSphere();
    root.add(dots, dashes);
  });

  return root;
}
