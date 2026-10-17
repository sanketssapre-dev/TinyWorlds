import {
  ArrowHelper,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Vector3,
} from "three";
import { RailwayPath } from "../railway/path";
import { TrainState } from "../train/motion";

export function createDiagnostics(path: RailwayPath): Group {
  const g = new Group();
  g.name = "diagnostics";
  g.visible = false;

  const pts: number[] = [];
  for (const s of path.samples) pts.push(s.position.x, s.position.y, s.position.z);
  const line = new Line(
    new BufferGeometry().setAttribute("position", new Float32BufferAttribute(pts, 3)),
    new LineBasicMaterial({ color: 0xffcc66 }),
  );
  g.add(line);

  const step = 24;
  for (let i = 0; i < path.samples.length - 1; i += step) {
    const s = path.samples[i];
    g.add(new ArrowHelper(s.tangent, s.position, 1.4, 0xff5533, 0.2, 0.12));
    g.add(new ArrowHelper(s.normal, s.position, 1.1, 0x66dd88, 0.2, 0.12));
    g.add(new ArrowHelper(s.binormal, s.position, 0.9, 0x6699ff, 0.2, 0.12));
  }
  return g;
}

export function updateTrainAxes(group: Group, train: TrainState): void {
  let axes = group.getObjectByName("train-axes") as Group | undefined;
  if (!axes) {
    axes = new Group();
    axes.name = "train-axes";
    group.add(axes);
  }
  axes.clear();
  const origin = train.loco.position;
  const x = new Vector3(1, 0, 0).applyQuaternion(train.loco.quaternion);
  const y = new Vector3(0, 1, 0).applyQuaternion(train.loco.quaternion);
  const z = new Vector3(0, 0, 1).applyQuaternion(train.loco.quaternion);
  axes.add(new ArrowHelper(x, origin, 1.2, 0xff6688));
  axes.add(new ArrowHelper(y, origin, 1.2, 0x88ffaa));
  axes.add(new ArrowHelper(z, origin, 1.2, 0x88aaff));
}
