/**
 * Turns a drag offset, in pixels, into the same -1..1 request the arrow keys
 * produce.
 *
 * The centre is neutral, so a finger resting still flies straight. A short
 * dead zone means a nervous thumb never wanders off course, and the mapping
 * saturates so you cannot ask for more than full deflection.
 */
export const STICK_DEAD_ZONE = 8;
export const STICK_RANGE = 90;

export function mapStick(
  offset: number,
  deadZone: number = STICK_DEAD_ZONE,
  range: number = STICK_RANGE,
): number {
  const magnitude = (Math.abs(offset) - deadZone) / range;
  const clamped = Math.min(1, Math.max(0, magnitude));
  if (clamped === 0) return 0;
  return Math.sign(offset) * clamped;
}
