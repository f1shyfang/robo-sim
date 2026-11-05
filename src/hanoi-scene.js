import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import RAPIER from '@dimforge/rapier3d-compat';

const STEP = 1 / 60;
const PEG_X = [-2, 0, 2];
const THICKNESS = 0.22;
const BASE_TOP = 0.16;
const rotation = { x: 0, y: 0, z: 0, w: 1 };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ease = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const palette = ['#ef7045', '#dda946', '#36a28f', '#5992c2', '#8f7ab3'];

/** Guide posts are visual only; dynamic disks use solid cylinder colliders. */
export async function createHanoiScene(container, onUpdate = () => {}) {
  await RAPIER.init();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#edf0ee');
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
  camera.position.set(7.8, 6.3, 8.1);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.domElement.setAttribute('aria-label', 'Robot arm moving colored Hanoi disks among three labeled pegs. Drag to orbit.');
  renderer.domElement.setAttribute('role', 'img');
  container.appendChild(renderer.domElement);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.set(0, 0.9, -0.25);
  orbit.enableDamping = true; orbit.enablePan = false;
  orbit.minDistance = 6; orbit.maxDistance = 17; orbit.maxPolarAngle = Math.PI * 0.46;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xafbcb0, 2.5));
  const sun = new THREE.DirectionalLight(0xfff7e8, 3.5);
  sun.position.set(-3, 8, 5); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5 });
  sun.shadow.normalBias = 0.025; scene.add(sun);
  const fill = new THREE.DirectionalLight(0xd1eaff, 1.6); fill.position.set(4, 4, -5); scene.add(fill);
  const material = color => new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.16 });
  const white = material('#fafaf5'), charcoal = material('#263936'), orange = material('#f77937'), steel = material('#bdcac3');
  function add(geometry, mat, position, parent = scene) {
    const mesh = new THREE.Mesh(geometry, mat); mesh.position.copy(position); mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  }
  function box(w, h, d, mat, p, parent) { return add(new THREE.BoxGeometry(w, h, d), mat, p, parent); }
  function cylinder(r, h, mat, p, parent) { return add(new THREE.CylinderGeometry(r, r, h, 40), mat, p, parent); }
  add(new THREE.PlaneGeometry(100, 100), material('#edf0ee'), V(0, -0.28, 0)).rotation.x = -Math.PI / 2;
  box(7.2, 0.25, 5.2, white, V(0, -0.125, -0.35));
  const grid = new THREE.GridHelper(6.8, 24, '#d1d9cf', '#e1e6dd'); grid.position.set(0, 0.006, -0.35); grid.scale.z = 0.72; scene.add(grid);
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 }); world.timestep = STEP; world.numSolverIterations = 8;
  const floor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.125, -0.35));
  world.createCollider(RAPIER.ColliderDesc.cuboid(3.6, 0.125, 2.6).setFriction(0.9), floor);
  for (let i = 0; i < 3; i++) {
    cylinder(0.91, 0.16, i === 2 ? material('#47a593') : white, V(PEG_X[i], 0.08, 0.35));
    const platform = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(PEG_X[i], 0.08, 0.35));
    world.createCollider(RAPIER.ColliderDesc.cylinder(0.08, 0.91).setFriction(0.95), platform);
    cylinder(0.055, 1.6, steel, V(PEG_X[i], 0.96, 0.35));
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64;
    const context = canvas.getContext('2d'); context.fillStyle = '#405b50'; context.font = '600 38px sans-serif'; context.textAlign = 'center'; context.fillText(`${String.fromCharCode(65 + i)}${i === 2 ? ' · GOAL' : ''}`, 128, 44);
    const texture = new THREE.CanvasTexture(canvas);
    const label = add(new THREE.PlaneGeometry(1.2, 0.3), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }), V(PEG_X[i], 0.015, 1.52)); label.rotation.x = -Math.PI / 2;
  }
  const shoulder = V(0, 0.9, -1.65);
  cylinder(0.54, 0.16, charcoal, V(0, 0.08, -1.65));
  cylinder(0.42, 0.45, white, V(0, 0.36, -1.65));
  cylinder(0.32, 0.3, orange, V(0, 0.72, -1.65));
  const upper = box(0.28, 1, 0.33, orange, shoulder);
  const lower = box(0.24, 1, 0.29, orange, shoulder);
  const joints = [0, 1, 2].map(() => { const mesh = cylinder(0.19, 0.35, charcoal, shoulder); mesh.rotation.x = Math.PI / 2; return mesh; });
  const gripper = new THREE.Group(); scene.add(gripper);
  cylinder(0.13, 0.2, charcoal, V(0, 0.26, 0), gripper);
  const gripBar = box(1, 0.09, 0.15, steel, V(0, 0.18, 0), gripper);
  const fingers = [-1, 1].map(sign => box(0.06, 0.3, 0.14, charcoal, V(sign * 0.4, 0.04, 0), gripper));
  const home = V(0, 2.05, -0.6), toolPosition = home.clone();
  const toolBody = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...home.toArray()));
  let disks = [], pegs = [[], [], []], diskCount = 3, pending = null, joint = null;
  let paused = false, phase = 'ready', physicsSteps = 0, fps = 0, frameCount = 0, disposed = false;
  let accumulator = 0, last = performance.now(), fpsTime = last, raf;
  function getState() {
    return { phase: paused ? 'paused' : phase, fps, pegs: pegs.map(p => [...p]), diskCount, moving: Boolean(pending), physicsSteps,
      activeMove: pending ? { disk: pending.disk, from: pending.from, to: pending.to } : null,
      diskPositions: disks.map(d => ({ disk: d.id, ...d.body.translation() })), attached: Boolean(joint) };
  }
  function notify() { onUpdate(getState()); }
  function release() { if (joint) { world.removeImpulseJoint(joint, true); joint = null; } }
  function cancel() {
    release();
    if (pending) { const reject = pending.reject; pending = null; reject(new DOMException('Move cancelled by reset', 'AbortError')); }
  }
  function diskMesh(id) {
    const radius = 0.28 + id * 0.1;
    const shape = new THREE.Shape(); shape.absarc(0, 0, radius, 0, Math.PI * 2, false);
    const hole = new THREE.Path(); hole.absarc(0, 0, 0.085, 0, Math.PI * 2, true); shape.holes.push(hole);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: THICKNESS, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.014, bevelSegments: 2, steps: 1, curveSegments: 40 });
    geometry.translate(0, 0, -THICKNESS / 2); geometry.rotateX(Math.PI / 2);
    return add(geometry, material(palette[id - 1]), V(0, 0, 0));
  }
  function reset(count = diskCount) {
    if (!Number.isInteger(count) || count < 2 || count > 5) throw new Error('Choose 2 to 5 disks.');
    cancel(); paused = false; phase = 'ready'; diskCount = count; accumulator = 0;
    disks.forEach(d => { world.removeRigidBody(d.body); scene.remove(d.mesh); d.mesh.geometry.dispose(); d.mesh.material.dispose(); }); disks = [];
    pegs = [Array.from({ length: count }, (_, index) => count - index), [], []];
    for (let id = 1; id <= count; id++) {
      const y = BASE_TOP + THICKNESS / 2 + (count - id) * THICKNESS + 0.005;
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(-2, y, 0.35).setCcdEnabled(true).setLinearDamping(1).setAngularDamping(3));
      world.createCollider(RAPIER.ColliderDesc.cylinder(THICKNESS / 2, 0.28 + id * 0.1).setMass(0.35 + id * 0.1).setFriction(0.95).setRestitution(0), body);
      const mesh = diskMesh(id); mesh.position.set(-2, y, 0.35); disks.push({ id, body, mesh });
    }
    toolPosition.copy(home); toolBody.setTranslation(home, true); toolBody.setNextKinematicTranslation(home); updateArm(); notify();
  }
  function updateArm() {
    gripper.position.copy(toolPosition);
    const radius = pending ? 0.28 + pending.disk * 0.1 : 0.38;
    gripBar.scale.x = radius * 2 + 0.14;
    fingers[0].position.x = -radius - 0.035; fingers[1].position.x = radius + 0.035;
    const wrist = toolPosition.clone().add(V(0, 0.36, 0));
    const direction = wrist.clone().sub(shoulder), distance = Math.min(direction.length(), 4.39), axis = direction.normalize();
    const lift = V(0, 1, 0).addScaledVector(axis, -axis.y).normalize();
    const along = distance / 2, height = Math.sqrt(Math.max(0, 2.2 ** 2 - along ** 2));
    const elbow = shoulder.clone().addScaledVector(axis, along).addScaledVector(lift, height);
    for (const [mesh, a, b] of [[upper, shoulder, elbow], [lower, elbow, wrist]]) {
      const delta = b.clone().sub(a); mesh.position.copy(a).add(b).multiplyScalar(0.5); mesh.scale.y = delta.length(); mesh.quaternion.setFromUnitVectors(V(0, 1, 0), delta.normalize());
    }
    [shoulder, elbow, wrist].forEach((p, index) => joints[index].position.copy(p));
  }
  function move(action) {
    if (disposed) return Promise.reject(new Error('Scene has been disposed.'));
    if (pending || paused) return Promise.reject(new Error('Finish or resume the current move first.'));
    const { disk, from, to } = action || {};
    if (![from, to].every(p => Number.isInteger(p) && p >= 0 && p <= 2) || from === to || !Number.isInteger(disk) || pegs[from].at(-1) !== disk || (pegs[to].length && pegs[to].at(-1) < disk)) return Promise.reject(new Error('Illegal move: only a top disk may move, and a larger disk cannot cover a smaller one.'));
    const cargo = disks.find(d => d.id === disk);
    const pickup = new THREE.Vector3().copy(cargo.body.translation());
    const destination = V(PEG_X[to], BASE_TOP + THICKNESS / 2 + pegs[to].length * THICKNESS + 0.045, 0.35);
    return new Promise((resolve, reject) => {
      pending = { disk, from, to, cargo, pickup, destination, start: toolPosition.clone(), elapsed: 0, settled: 0, released: false, resolve, reject };
      phase = 'moving'; notify();
    });
  }
  function trajectory(m) {
    const t = m.elapsed, highPick = m.pickup.clone().setY(2.05), highTarget = m.destination.clone().setY(2.05);
    if (t < 0.35) return m.start.clone().lerp(highPick, ease(t / 0.35));
    if (t < 0.7) return highPick.lerp(m.pickup, ease((t - 0.35) / 0.35));
    if (t < 1.15) return m.pickup.clone().lerp(highPick, ease((t - 0.7) / 0.45));
    if (t < 1.65) return highPick.lerp(highTarget, ease((t - 1.15) / 0.5));
    if (t < 2.1) return highTarget.lerp(m.destination, ease((t - 1.65) / 0.45));
    if (t < 2.25) return m.destination.clone();
    return m.destination.clone().lerp(highTarget, ease((t - 2.25) / 0.35));
  }
  function step() {
    if (paused) return;
    physicsSteps++;
    const m = pending;
    if (m) {
      m.elapsed += STEP; toolPosition.copy(trajectory(m)); toolBody.setNextKinematicTranslation(toolPosition);
      if (m.elapsed >= 0.7 && !joint && !m.released) {
        const p = m.cargo.body.translation();
        joint = world.createImpulseJoint(RAPIER.JointData.fixed({ x: p.x - toolPosition.x, y: p.y - toolPosition.y, z: p.z - toolPosition.z }, rotation, { x: 0, y: 0, z: 0 }, rotation), toolBody, m.cargo.body, true);
      }
      if (m.elapsed >= 2.2 && !m.released) { release(); m.released = true; }
    }
    world.step();
    disks.forEach(d => { const p = d.body.translation(); d.mesh.position.set(p.x, p.y, p.z); d.mesh.quaternion.copy(d.body.rotation()); });
    if (m?.released) {
      const p = m.cargo.body.translation(), v = m.cargo.body.linvel();
      const settled = Math.abs(p.x - m.destination.x) < 0.08 && Math.abs(p.z - m.destination.z) < 0.08 && Math.abs(p.y - (m.destination.y - 0.045)) < 0.035 && Math.hypot(v.x, v.y, v.z) < 0.06;
      m.settled = settled ? m.settled + STEP : 0;
      if (m.settled > 0.25 && m.elapsed >= 2.6) {
        pegs[m.from].pop(); pegs[m.to].push(m.disk); pending = null; phase = 'ready'; notify(); m.resolve(getState());
      } else if (m.elapsed > 7) { pending = null; phase = 'error'; notify(); m.reject(new Error('The disk did not settle on its destination. Reset the puzzle and retry.')); }
    }
  }
  function pause() { if (pending) { paused = true; notify(); } }
  function resume() { paused = false; notify(); }
  function resize() {
    const width = Math.max(container.clientWidth, 1), height = Math.max(container.clientHeight, 1);
    camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height);
  }
  const observer = new ResizeObserver(resize); observer.observe(container); resize();
  function frame(now) {
    if (disposed) return;
    accumulator += Math.min(Math.max(0, (now - last) / 1000), 0.1); last = now;
    while (accumulator >= STEP) { step(); accumulator -= STEP; }
    updateArm(); orbit.update(); renderer.render(scene, camera);
    frameCount++; if (now - fpsTime >= 300) { fps = Math.round(frameCount * 1000 / (now - fpsTime)); frameCount = 0; fpsTime = now; notify(); }
    raf = requestAnimationFrame(frame);
  }
  function dispose() {
    if (disposed) return; disposed = true; cancel(); cancelAnimationFrame(raf); observer.disconnect(); orbit.dispose();
    scene.traverse(o => { o.geometry?.dispose(); if (o.material) { for (const m of Array.isArray(o.material) ? o.material : [o.material]) { m.map?.dispose(); m.dispose(); } } });
    world.free(); renderer.dispose(); renderer.domElement.remove();
  }
  reset(3); raf = requestAnimationFrame(frame);
  return { reset, move, pause, resume, dispose, getState };
}
