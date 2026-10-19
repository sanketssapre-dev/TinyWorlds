import {
  AdditiveBlending,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  SphereGeometry,
  Vector3,
} from "three";
import { RailwayPath, getSampleAt, scratchSample } from "../flight/railway/path";

const MARKER_SPACING = 3.4;
/** Ride height is only a draft above the flood. Lift the ribbon clear of the surface. */
const LIFT = 2.35;
const AXIS_Y = new Vector3(0, 1, 0);
const COLORS = [
  0x5ce1ff, 0xffe14a, 0xff5d7a, 0x7dff9a, 0xd9a6ff, 0xff9a3c, 0x9ad7ff, 0xff6bff, 0xd6ff4a, 0xfff3c4,
];

const dotGeometry = new SphereGeometry(0.16, 8, 6);
const dashGeometry = new CylinderGeometry(0.045, 0.045, 1.05, 6);
const dummy = new Object3D();
const basis = new Matrix4();

/** Glowing dots and dashes for every yacht route. Open with ?pathdebug */
export function createSailPathMarkers(paths: readonly RailwayPath[]): Group {
  const root = new Group();
  root.name = "sail-path-debug-markers";

  paths.forEach((path, variant) => {
    const color = COLORS[variant % COLORS.length];
    const count = Math.max(2, Math.floor(path.totalLength / MARKER_SPACING));
    const dotCount = Math.ceil(count / 2);
    const dashCount = Math.floor(count / 2);
    const route = new Group();
    route.name = `sail-route-${variant + 1}`;

    const dots = ribbon(dotGeometry, color, 1, dotCount, `sail-route-${variant + 1}-dots`, 24);
    const dotGlow = ribbon(dotGeometry, color, 0.42, dotCount, `sail-route-${variant + 1}-dot-glow`, 23);
    const dashes = ribbon(dashGeometry, color, 1, dashCount, `sail-route-${variant + 1}-dashes`, 24);
    const dashGlow = ribbon(dashGeometry, color, 0.38, dashCount, `sail-route-${variant + 1}-dash-glow`, 23);

    let dotsWritten = 0;
    let dashesWritten = 0;
    for (let i = 0; i < count; i++) {
      const sample = getSampleAt(path, (i / count) * path.totalLength, scratchSample());
      dummy.position.copy(sample.position).addScaledVector(sample.normal, LIFT);
      dummy.quaternion.identity();
      dummy.scale.setScalar(1);
      if (i % 2 === 0) {
        dummy.updateMatrix();
        dots.setMatrixAt(dotsWritten, dummy.matrix);
        dummy.scale.setScalar(1.55);
        dummy.updateMatrix();
        dotGlow.setMatrixAt(dotsWritten, dummy.matrix);
        dotsWritten++;
      } else {
        dummy.quaternion.setFromUnitVectors(AXIS_Y, sample.tangent);
        dummy.updateMatrix();
        dashes.setMatrixAt(dashesWritten, dummy.matrix);
        dummy.scale.set(1.55, 1.05, 1.55);
        dummy.updateMatrix();
        dashGlow.setMatrixAt(dashesWritten, dummy.matrix);
        dashesWritten++;
      }
    }

    for (const mesh of [dots, dotGlow, dashes, dashGlow]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      route.add(mesh);
    }
    root.add(route);
  });

  return root;
}

function ribbon(
  geometry: SphereGeometry | CylinderGeometry,
  color: number,
  opacity: number,
  count: number,
  name: string,
  renderOrder: number,
): InstancedMesh {
  const material = new MeshBasicMaterial({
    color,
    blending: AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
    transparent: true,
    opacity,
    fog: false,
  });
  const mesh = new InstancedMesh(geometry, material, Math.max(1, count));
  mesh.name = name;
  mesh.renderOrder = renderOrder;
  mesh.frustumCulled = true;
  mesh.count = Math.max(0, count);
  if (count === 0) mesh.setMatrixAt(0, basis.makeTranslation(0, -1e6, 0));
  return mesh;
}
