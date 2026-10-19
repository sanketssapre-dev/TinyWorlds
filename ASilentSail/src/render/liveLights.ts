import { ShaderChunk } from "three";

const DIRECT_CALL =
  "RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );";

/**
 * Three still runs a full GGX evaluation for point lights that have already
 * attenuated to zero. getPointLightInfo marks those IncidentLight values
 * invisible; skip RE_Direct in that case. Visible lights, including fires
 * and the belly lamps, take the same path as before.
 */
export function skipInvisibleDirectLight(): void {
  const source = ShaderChunk.lights_fragment_begin;
  if (source.includes("if ( directLight.visible ) RE_Direct(")) return;
  const parts = source.split(DIRECT_CALL);
  if (parts.length !== 4) {
    throw new Error(
      `Expected 3 RE_Direct calls in lights_fragment_begin, found ${parts.length - 1}.`,
    );
  }
  ShaderChunk.lights_fragment_begin = parts.join(`if ( directLight.visible ) ${DIRECT_CALL}`);
}
