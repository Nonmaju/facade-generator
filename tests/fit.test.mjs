import test from "node:test";
import assert from "node:assert/strict";
import { fitDistance, VIEW_DIR } from "../web/studio/view/fit.js";

const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => a.map((v) => v / Math.hypot(...a));

// Pinhole projection of a point into normalized device coordinates for a camera looking at `target`.
function ndc(point, pos, target, vfovDeg, aspect) {
  const f = norm(sub(target, pos));
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const v = sub(point, pos);
  const t = Math.tan((vfovDeg * Math.PI) / 360);
  const z = dot(v, f);
  return [dot(v, r) / (z * t * aspect), dot(v, u) / (z * t), z];
}

test("the whole facade is in view for any size and any window aspect", () => {
  const fov = 35;
  const dir = norm(VIEW_DIR);
  for (const w of [4, 10.8, 21.6, 43.2]) {
    for (const h of [6, 14.4, 38, 54]) {
      for (const aspect of [0.5, 1, 1.39, 2, 3]) {
        const target = [w / 2, h / 2, 0];
        const d = fitDistance(w, h, fov, aspect);
        const pos = target.map((c, i) => c + dir[i] * d);
        for (const x of [0, w]) for (const y of [0, h]) for (const z of [0, 0.5]) {
          const [nx, ny, depth] = ndc([x, y, z], pos, target, fov, aspect);
          assert.ok(depth > 0, "corner is behind the camera");
          assert.ok(Math.abs(nx) <= 1 && Math.abs(ny) <= 1, `${w}x${h} aspect ${aspect}: corner (${x},${y},${z}) at ndc ${nx.toFixed(2)},${ny.toFixed(2)}`);
        }
      }
    }
  }
});

test("distance grows with facade size and shrinks as the window gets wider", () => {
  assert.ok(fitDistance(40, 40, 35, 1.4) > fitDistance(10, 10, 35, 1.4));
  assert.ok(fitDistance(20, 20, 35, 0.5) > fitDistance(20, 20, 35, 2));
});
