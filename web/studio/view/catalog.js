// The 6 swappable finishes. `tile` = [u, v] meters covered by one texture repeat (same aspect as the image); `fallback` = flat color used
// until (or if) the texture files fail to load. Texture files: web/textures/<id>/{color,normal,rough}.jpg
export const MATERIAL_CATALOG = [
  { id: "concrete", label: "콘크리트", tile: [2.0, 1.0], fallback: 0xa9a9a6 },
  { id: "brick", label: "벽돌", tile: [1.2, 0.6], fallback: 0x9c5a46 },
  { id: "wood", label: "목재", tile: [1.5, 0.75], fallback: 0x9a7048 },
  { id: "plaster", label: "플라스터", tile: [2.0, 1.0], fallback: 0xe3ddd0 },
  { id: "metal", label: "금속 패널", tile: [1.0, 1.0], fallback: 0x8a9096 },
  { id: "stone", label: "석재", tile: [1.5, 1.5], fallback: 0xb5ad9e },
];

// Which catalog entry each swappable slot starts with.
export const DEFAULT_FINISH = { primary: "brick", secondary: "concrete" };
