// Camera placement for the studio view. Pure math (no Three.js) so Node can test it.

// Direction from the facade center toward the camera: a bit to the right and above, mostly in front.
export const VIEW_DIR = [0.45, 0.1, 0.95];

/**
 * Camera distance that keeps a w x h facade fully in view from any viewing angle:
 * fit its bounding sphere into the narrower of the vertical and horizontal fields of view.
 * (A flat "fit width/height" formula crops the nearer edge when the camera looks at the facade from the side.)
 */
export function fitDistance(w, h, vfovDeg, aspect) {
  const vf = (vfovDeg * Math.PI) / 180;
  const hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
  const radius = Math.hypot(w, h) / 2;
  return (radius * 1.1) / Math.sin(Math.min(vf, hf) / 2);
}
