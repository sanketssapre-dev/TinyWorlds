import { Vector3 } from "three";

export function sphToCart(
  radius: number,
  theta: number,
  phi: number,
  target = new Vector3(),
): Vector3 {
  const st = Math.sin(theta);
  return target.set(
    radius * st * Math.cos(phi),
    radius * Math.cos(theta),
    radius * st * Math.sin(phi),
  );
}

export function cartToSph(v: Vector3): { r: number; theta: number; phi: number } {
  const r = v.length();
  const theta = r < 1e-8 ? 0 : Math.acos(Math.min(1, Math.max(-1, v.y / r)));
  const phi = Math.atan2(v.z, v.x);
  return { r, theta, phi };
}

export function angularDistance(
  thetaA: number,
  phiA: number,
  thetaB: number,
  phiB: number,
): number {
  const a = sphToCart(1, thetaA, phiA);
  const b = sphToCart(1, thetaB, phiB);
  return Math.acos(Math.min(1, Math.max(-1, a.dot(b))));
}

export function wrapPhi(phi: number): number {
  const t = phi % (Math.PI * 2);
  return t < 0 ? t + Math.PI * 2 : t;
}

export function wrap01(s: number, length: number): number {
  if (length <= 0) return 0;
  const t = s % length;
  return t < 0 ? t + length : t;
}

export function orthonormalFrame(
  position: Vector3,
  tangent: Vector3,
  fallbackSide?: Vector3,
): { tangent: Vector3; normal: Vector3; binormal: Vector3 } {
  const t = tangent.clone().normalize();
  const radial = position.clone().normalize();
  let side = new Vector3().crossVectors(t, radial);
  if (side.lengthSq() < 1e-8) {
    if (fallbackSide && fallbackSide.lengthSq() > 1e-8) {
      side.copy(fallbackSide);
    } else {
      const hint =
        Math.abs(radial.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
      side.crossVectors(t, hint);
    }
  }
  side.normalize();
  const normal = new Vector3().crossVectors(side, t).normalize();
  const binormal = new Vector3().crossVectors(t, normal).normalize();
  return { tangent: t, normal, binormal };
}
