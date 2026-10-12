import * as THREE from "three";
import { MATERIAL_CATALOG } from "./catalog.js";

const loader = new THREE.TextureLoader();

const glass = new THREE.MeshPhysicalMaterial({
  color: 0x9ec3d6, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.55,
});
const frame = new THREE.MeshStandardMaterial({ color: 0x2b2f33, metalness: 0.8, roughness: 0.4 });

/**
 * Instanced unit boxes have stretched UVs. Replace them with world-space planar UVs
 * (projection plane chosen by the dominant normal axis) so one texture repeat = `tile` meters.
 */
function useWorldUv(material, tile) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTile = { value: tile };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTile;")
      .replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
        {
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vec3 wn = abs(normalize(mat3(instanceMatrix) * normal));
          vec2 wuv = (wn.z >= wn.x && wn.z >= wn.y) ? wp.xy : ((wn.x >= wn.y) ? wp.zy : wp.xz);
          wuv /= uTile;
          #ifdef USE_MAP
            vMapUv = wuv;
          #endif
          #ifdef USE_NORMALMAP
            vNormalMapUv = wuv;
          #endif
          #ifdef USE_ROUGHNESSMAP
            vRoughnessMapUv = wuv;
          #endif
        }`
      );
  };
}

export function createMaterialLibrary() {
  const cache = new Map();

  function finish(id) {
    if (cache.has(id)) return cache.get(id);
    const entry = MATERIAL_CATALOG.find((m) => m.id === id);
    if (!entry) throw new Error(`unknown material "${id}"`);
    // Flat fallback look; textures replace it when (and if) they load.
    const mat = new THREE.MeshStandardMaterial({ color: entry.fallback, roughness: 0.9 });
    useWorldUv(mat, entry.tile);
    const load = (file, apply) =>
      loader.load(
        `textures/${id}/${file}`,
        (t) => {
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          apply(t);
          mat.needsUpdate = true;
        },
        undefined,
        () => console.warn(`texture missing, using flat color: textures/${id}/${file}`)
      );
    load("color.jpg", (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      mat.map = t;
      mat.color.set(0xffffff);
    });
    load("normal.jpg", (t) => (mat.normalMap = t));
    load("rough.jpg", (t) => {
      mat.roughnessMap = t;
      mat.roughness = 1;
    });
    cache.set(id, mat);
    return mat;
  }

  return {
    /** Material for a slot. Only primary/secondary use `finishId`; glass and frame are fixed. */
    forSlot(slot, finishId) {
      if (slot === "glass") return glass;
      if (slot === "frame") return frame;
      return finish(finishId);
    },
  };
}
