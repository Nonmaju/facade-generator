import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { SLOTS } from "../grammar/validate.js";
import { createMaterialLibrary } from "./materials.js";
import { DEFAULT_FINISH } from "./catalog.js";
import { fitDistance, VIEW_DIR } from "./fit.js";

/**
 * Thin Three.js layer: one InstancedMesh per material slot, fed with terminal boxes from the grammar.
 * Returns null when WebGL is unavailable (the caller shows a message).
 */
export function createScene(canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdfe6ec);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envTarget.texture;
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.6));

  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun, sun.target);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshStandardMaterial({ color: 0xcfd4d8, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.receiveShadow = true;
  scene.add(ground);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 600);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;

  const lib = createMaterialLibrary();
  const finish = { ...DEFAULT_FINISH };
  const box = new THREE.BoxGeometry(1, 1, 1);
  const slots = new Map(); // slot -> { mesh, cap }
  const dummy = new THREE.Object3D();
  const materialFor = (slot) => lib.forSlot(slot, finish[slot]);

  function ensure(slot, n) {
    let s = slots.get(slot);
    if (s && s.cap >= n) return s;
    if (s) {
      scene.remove(s.mesh);
      s.mesh.dispose();
    }
    const cap = Math.max(64, n * 2);
    const mesh = new THREE.InstancedMesh(box, materialFor(slot), cap);
    mesh.castShadow = slot !== "glass";
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
    s = { mesh, cap };
    slots.set(slot, s);
    return s;
  }

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); // sharp on phones and retina, but never more than 2x
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });

  return {
    /** Stop rendering and free GPU memory. The scene object must not be used afterwards. */
    dispose() {
      renderer.setAnimationLoop(null);
      observer.disconnect();
      controls.dispose();
      for (const { mesh } of slots.values()) {
        scene.remove(mesh);
        mesh.dispose();
      }
      slots.clear();
      box.dispose();
      envTarget.dispose();
      ground.geometry.dispose();
      ground.material.dispose();
      sun.shadow.map?.dispose();
      lib.dispose();
      renderer.dispose();
    },

    /** terminals: [{x,y,z,w,h,d,mat}] from the grammar. Rewrites instance matrices only. */
    setTerminals(terminals) {
      const bySlot = Object.fromEntries(SLOTS.map((s) => [s, []]));
      for (const t of terminals) bySlot[t.mat].push(t);
      for (const slot of SLOTS) {
        const list = bySlot[slot];
        const s = list.length ? ensure(slot, list.length) : slots.get(slot);
        if (!s) continue;
        list.forEach((t, i) => {
          dummy.position.set(t.x + t.w / 2, t.y + t.h / 2, t.z + t.d / 2);
          dummy.scale.set(t.w, t.h, t.d);
          dummy.updateMatrix();
          s.mesh.setMatrixAt(i, dummy.matrix);
        });
        s.mesh.count = list.length;
        s.mesh.instanceMatrix.needsUpdate = true;
      }
    },

    /** Swap the finish of a slot (primary/secondary). Geometry is untouched. */
    setMaterial(slot, finishId) {
      finish[slot] = finishId;
      const s = slots.get(slot);
      if (s) s.mesh.material = materialFor(slot);
    },

    /** Frame a width x height facade (meters) and aim the sun at it. */
    fit(w, h) {
      resize(); // re-measure first: the camera aspect must match the canvas as it is right now
      const dist = fitDistance(w, h, camera.fov, camera.aspect);
      controls.target.set(w / 2, h / 2, 0);
      camera.position.copy(controls.target).addScaledVector(new THREE.Vector3(...VIEW_DIR).normalize(), dist);
      sun.position.set(w / 2 - w * 0.6 - 10, h + 25, 35);
      sun.target.position.set(w / 2, h / 2, 0);
      const r = Math.max(w, h) * 1.2;
      Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 250 });
      sun.shadow.camera.updateProjectionMatrix();
      controls.update();
    },

    /** PNG Blob of the current view. */
    screenshot() {
      renderer.render(scene, camera);
      return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    },
  };
}
