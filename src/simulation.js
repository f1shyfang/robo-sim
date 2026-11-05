import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import RAPIER from '@dimforge/rapier3d-compat';

const STEP = 1 / 60;
const MAX_BLOCKS = 20;
const identity = { x: 0, y: 0, z: 0, w: 1 };
const vec = (x, y, z) => new THREE.Vector3(x, y, z);
const smooth = t => { t = THREE.MathUtils.clamp(t, 0, 1); return t * t * (3 - 2 * t); };

export async function createSimulation(container, onUpdate = () => {}) {
  await RAPIER.init();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#edf0ee');
  scene.fog = new THREE.Fog('#edf0ee', 15, 32);
  const camera = new THREE.PerspectiveCamera(37, 1, 0.1, 70);
  camera.position.set(6.8, 5.9, 7.6);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.domElement.setAttribute('aria-label', 'Interactive 3D robot arm simulation. Drag to orbit and scroll to zoom.');
  renderer.domElement.setAttribute('role', 'img');
  container.appendChild(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.9, 0);
  controls.enableDamping = true;
  controls.minDistance = 6;
  controls.maxDistance = 16;
  controls.maxPolarAngle = Math.PI * 0.46;
  controls.minPolarAngle = 0.3;
  controls.enablePan = false;
  const hemi = new THREE.HemisphereLight(0xffffff, 0xb2bcaa, 2.2);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff6e9, 4.5);
  key.position.set(-3, 8, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -6; key.shadow.camera.right = 6;
  key.shadow.camera.top = 6; key.shadow.camera.bottom = -6;
  key.shadow.normalBias = 0.025;
  key.shadow.bias = -0.0002;
  key.shadow.radius = 4;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xc9e9ff, 2.1);
  fill.position.set(4, 5, -6); scene.add(fill);
  const materials = {
    orange: new THREE.MeshStandardMaterial({ color: '#f77937', roughness: 0.31, metalness: 0.18 }),
    orangeDark: new THREE.MeshStandardMaterial({ color: '#c94c20', roughness: 0.4, metalness: 0.2 }),
    graphite: new THREE.MeshStandardMaterial({ color: '#263333', roughness: 0.33, metalness: 0.65 }),
    steel: new THREE.MeshStandardMaterial({ color: '#b7c4c2', roughness: 0.28, metalness: 0.8 }),
    white: new THREE.MeshStandardMaterial({ color: '#f9faf7', roughness: 0.65 }),
    teal: new THREE.MeshStandardMaterial({ color: '#2b9b87', roughness: 0.45, metalness: 0.12 }),
    glow: new THREE.MeshStandardMaterial({ color: '#75ead0', emissive: '#50bda3', emissiveIntensity: 0.7, roughness: 0.45 }),
  };
  function mesh(geometry, material, position, parent = scene) {
    const m = new THREE.Mesh(geometry, material);
    if (position) m.position.copy(position);
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  function box(w, h, d, material, position, parent) {
    return mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(0.06, h / 5)), material, position, parent);
  }
  function cylinder(r, h, material, position, parent) {
    return mesh(new THREE.CylinderGeometry(r, r, h, 48), material, position, parent);
  }
  function label(text, position, width = 1.5, color = '#52675f') {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = color; ctx.font = '500 38px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, 48);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 96 / 512), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
    p.rotation.x = -Math.PI / 2; p.position.copy(position); scene.add(p); return p;
  }
  mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#edf0ee', roughness: 0.85 }), vec(0, -0.28, 0)).rotation.x = -Math.PI / 2;
  box(8.6, 0.26, 10.4, materials.white, vec(0, -0.13, 1.5));
  box(8.3, 0.08, 10.1, new THREE.MeshStandardMaterial({ color: '#d1d9d3', roughness: 0.7 }), vec(0, -0.3, 1.5));
  const grid = new THREE.GridHelper(8.2, 28, '#c9d2cb', '#dce2dc'); grid.position.set(0, 0.004, 1.5); grid.scale.z = 1.22; scene.add(grid);
  const base = vec(-1.55, 0, -0.15);
  cylinder(0.68, 0.12, materials.graphite, vec(base.x, 0.06, base.z));
  cylinder(0.53, 0.3, materials.white, vec(base.x, 0.25, base.z));
  cylinder(0.46, 0.15, materials.orange, vec(base.x, 0.48, base.z));
  cylinder(0.36, 0.36, materials.graphite, vec(base.x, 0.72, base.z));
  for (let a = 0; a < 4; a++) {
    const angle = a * Math.PI / 2 + Math.PI / 4;
    cylinder(0.055, 0.025, materials.steel, vec(base.x + Math.cos(angle) * 0.56, 0.13, base.z + Math.sin(angle) * 0.56));
  }
  const platformPosition = vec(1.0, 0.14, -1.23);
  box(2.4, 0.28, 2.4, materials.teal, platformPosition);
  box(2.24, 0.025, 2.24, materials.glow, vec(1.0, 0.29, -1.23));
  box(2.08, 0.018, 2.08, materials.teal, vec(1.0, 0.315, -1.23));
  label('STACKING PALLET', vec(1.0, 0.012, -2.65), 1.65, '#287563');
  label('PICKUP', vec(0.65, 0.012, 2.1), 1.05);
  label('ARM / 01', vec(-1.6, 0.012, 1.05), 1.1);
  // A physical low barrier makes the lift-and-clear stage visible.
  box(0.3, 0.3, 1.0, materials.white, vec(1.45, 0.15, 0.32));
  box(0.32, 0.04, 1.02, materials.graphite, vec(1.45, 0.32, 0.32));
  const pickup = vec(0.7, 0.32, 1.35);
  const target = vec(1.45, 0.65, -0.78);
  const pickupPositions = [pickup, vec(-0.05, 0.32, 1.35), vec(-0.8, 0.32, 1.65), vec(0.7, 0.32, 2.1), vec(-0.05, 0.32, 2.1)];
  for (const z of [2.85, 3.6, 4.35]) {
    for (const x of [-2.3, -1.55, -0.8, -0.05, 0.7]) pickupPositions.push(vec(x, 0.32, z));
  }
  const towerPositions = [vec(1.45, 0, -0.78), vec(0.55, 0, -0.78), vec(1.45, 0, -1.68), vec(0.55, 0, -1.68)];
  function targetFor(index) {
    const tower = towerPositions[Math.floor(index / 5)];
    return vec(tower.x, 0.61 + (index % 5) * 0.58, tower.z);
  }
  const blocks = [];
  const shoulder = vec(base.x, 0.96, base.z);
  const upper = box(0.34, 1, 0.39, materials.orange, shoulder);
  const lower = box(0.28, 1, 0.32, materials.orange, shoulder);
  const upperInset = box(0.12, 0.75, 0.405, materials.orangeDark, vec(0, 0, 0), upper);
  const lowerInset = box(0.1, 0.7, 0.335, materials.orangeDark, vec(0, 0, 0), lower);
  const joints = [shoulder, shoulder, shoulder].map(p => {
    const j = cylinder(0.24, 0.46, materials.graphite, p); j.rotation.x = Math.PI / 2;
    const cap = cylinder(0.145, 0.48, materials.steel, vec(0, 0, 0), j);
    return j;
  });
  const gripper = new THREE.Group(); scene.add(gripper);
  cylinder(0.16, 0.22, materials.graphite, vec(0, 0.43, 0), gripper);
  box(0.65, 0.12, 0.22, materials.steel, vec(0, 0.27, 0), gripper);
  const fingers = [-1, 1].map(sign => box(0.07, 0.4, 0.18, materials.graphite, vec(sign * 0.37, 0.06, 0), gripper));
  const toolLight = mesh(new THREE.SphereGeometry(0.045, 12, 12), materials.glow, vec(0, 0.43, 0.15), gripper);
  toolLight.castShadow = false;

  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = STEP;
  const queue = new RAPIER.EventQueue(true);
  function fixedBox(position, half) {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z));
    world.createCollider(RAPIER.ColliderDesc.cuboid(...half).setFriction(0.8), body);
    return body;
  }
  fixedBox(vec(0, -0.13, 1.5), [4.3, 0.13, 5.2]);
  fixedBox(vec(1.0, 0.16, -1.23), [1.2, 0.16, 1.2]);
  fixedBox(vec(1.45, 0.17, 0.32), [0.16, 0.17, 0.51]);
  function createBlock(index) {
    const origin = pickupPositions[index];
    const cargo = box(0.58, 0.58, 0.58, materials.orange, origin);
    const band = box(0.595, 0.1, 0.595, materials.orangeDark, vec(0, 0, 0), cargo);
    band.castShadow = false;
    box(0.22, 0.012, 0.22, materials.white, vec(0, 0.298, 0), cargo).castShadow = false;
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(...origin.toArray()).setCcdEnabled(true).setLinearDamping(0.6).setAngularDamping(1.8));
    const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(0.29, 0.29, 0.29).setMass(0.5).setFriction(0.85).setRestitution(0.0).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), body);
    blocks.push({ mesh: cargo, body, collider, origin });
  }
  createBlock(0);
  const home = vec(0.12, 1.65, 0.75);
  const toolPosition = home.clone();
  const toolBody = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...home.toArray()));
  let physicsSteps = 0, activeIndex = 0, completed = 0;
  let joint = null, phase = 'ready', progress = 0, elapsed = 0, collisionCount = 0, released = false, settled = 0;
  let graspPoint = pickup.clone(), startPoint = home.clone();
  let fps = 0, frames = 0, fpsTime = performance.now(), last = performance.now(), accumulator = 0, raf, disposed = false;
  function updateArm() {
    gripper.position.copy(toolPosition);
    const wrist = toolPosition.clone().add(vec(0, 0.52, 0));
    const direction = wrist.clone().sub(shoulder);
    const upperLength = blocks.length > 5 ? 3.1 : 2.25;
    const lowerLength = blocks.length > 5 ? 3.05 : 2.2;
    const distance = Math.min(direction.length(), upperLength + lowerLength - 0.01);
    const axis = direction.normalize();
    const lift = vec(0, 1, 0).addScaledVector(axis, -axis.y).normalize();
    const along = (upperLength ** 2 - lowerLength ** 2 + distance ** 2) / (2 * distance);
    const height = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2));
    const elbow = shoulder.clone().addScaledVector(axis, along).addScaledVector(lift, height);
    function segment(m, a, b) {
      const d = b.clone().sub(a); m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(vec(0, 1, 0), d.clone().normalize()); m.scale.y = d.length();
    }
    segment(upper, shoulder, elbow); segment(lower, elbow, wrist);
    joints[0].position.copy(shoulder); joints[1].position.copy(elbow); joints[2].position.copy(wrist);
    const azimuth = Math.atan2(wrist.z - shoulder.z, wrist.x - shoulder.x);
    joints.forEach(j => { j.rotation.set(Math.PI / 2, 0, azimuth); });
    const grip = joint ? 0.325 : 0.41;
    fingers[0].position.x = -grip; fingers[1].position.x = grip;
  }
  function attach() {
    const cargoBody = blocks[activeIndex].body;
    const p = cargoBody.translation();
    // The frame offset captures the contact position; the dynamic cube is never teleported.
    const anchor = { x: p.x - toolPosition.x, y: p.y - toolPosition.y, z: p.z - toolPosition.z };
    joint = world.createImpulseJoint(RAPIER.JointData.fixed(anchor, identity, { x: 0, y: 0, z: 0 }, identity), toolBody, cargoBody, true);
  }
  function release() { if (joint) { world.removeImpulseJoint(joint, true); joint = null; } }
  function trajectory(t) {
    const clearance = Math.max(graspPoint.y + 1.25, target.y + 0.45, blocks.length > 5 ? 3.6 : 0);
    const abovePick = graspPoint.clone().setY(clearance);
    const aboveTarget = target.clone().setY(clearance);
    const place = target.clone().add(vec(0, 0.06, 0));
    if (t < 1.3) return startPoint.clone().lerp(abovePick, smooth(t / 1.3));
    if (t < 2.3) return abovePick.lerp(graspPoint, smooth((t - 1.3) / 1));
    if (t < 3.7) return graspPoint.clone().lerp(abovePick, smooth((t - 2.3) / 1.4));
    if (t < 5.3) return abovePick.lerp(aboveTarget, smooth((t - 3.7) / 1.6));
    if (t < 6.5) return aboveTarget.lerp(place, smooth((t - 5.3) / 1.2));
    if (t < 6.8) return place;
    return place.lerp(home, smooth((t - 6.8) / 1.2));
  }
  function isStacked(block, index) {
    const p = block.body.translation(), velocity = block.body.linvel();
    const expected = targetFor(index);
    return Math.abs(p.x - expected.x) < 0.16 && Math.abs(p.z - expected.z) < 0.16 && Math.abs(p.y - expected.y) < 0.065 && Math.hypot(velocity.x, velocity.y, velocity.z) < 0.08;
  }
  function getState() {
    const positions = blocks.map((block, index) => {
      const p = block.body.translation();
      const destination = targetFor(index);
      return { x: p.x, y: p.y, z: p.z, stacked: isStacked(block, index), tower: Math.floor(index / 5), level: index % 5, target: { x: destination.x, y: destination.y, z: destination.z } };
    });
    return { fps, phase, progress, collisions: collisionCount, block: positions[0], blocks: positions, blockCount: blocks.length, maxBlocks: MAX_BLOCKS, stackedCount: positions.filter(p => p.stacked).length, activeBlock: activeIndex, elapsed, attached: Boolean(joint), gripped: Boolean(joint), physicsSteps, released, target: { x: target.x, y: target.y, z: target.z }, targetBounds: { minX: blocks.length > 5 ? 0.15 : 1.05, maxX: 1.85, minZ: blocks.length > 10 ? -2.08 : -1.18, maxZ: -0.38, minY: 0.55, maxY: 0.72 + Math.min(blocks.length - 1, 4) * 0.58 }, physicsHz: 60 };
  }
  function beginBlock(index) {
    activeIndex = index;
    const p = blocks[index].body.translation();
    graspPoint.set(p.x, p.y, p.z);
    startPoint.copy(toolPosition);
    target.copy(targetFor(index)).add(vec(0, 0.04, 0));
    released = false; settled = 0; elapsed = 0;
  }
  function step() {
    physicsSteps++;
    if (phase === 'running') {
      elapsed += STEP;
      toolPosition.copy(trajectory(elapsed));
      toolBody.setNextKinematicTranslation(toolPosition);
      if (elapsed >= 2.3 && !joint && !released) attach();
      if (elapsed >= 6.7 && !released) { release(); released = true; }
      progress = Math.min((completed + Math.min(elapsed / 8.3, 0.99)) / blocks.length, 0.99);
    }
    world.step(queue);
    queue.drainCollisionEvents((a, b, started) => {
      if (started && blocks.some(block => a === block.collider.handle || b === block.collider.handle)) collisionCount++;
    });
    blocks.forEach(block => {
      const p = block.body.translation();
      block.mesh.position.set(p.x, p.y, p.z);
      block.mesh.quaternion.copy(block.body.rotation());
    });
    if (phase === 'running' && released) {
      const allPlacedStable = blocks.slice(0, activeIndex + 1).every(isStacked);
      settled = allPlacedStable ? settled + STEP : 0;
      if (settled > 0.65 && elapsed > 8) {
        completed = activeIndex + 1;
        if (completed === blocks.length) { phase = 'success'; progress = 1; }
        else beginBlock(completed);
      }
      if (elapsed > 14 && phase === 'running') phase = 'stopped';
    }
  }
  function reset() {
    release(); phase = 'ready'; progress = 0; elapsed = 0; collisionCount = 0; released = false; settled = 0; accumulator = 0; completed = 0; activeIndex = 0;
    target.set(1.45, 0.65, -0.78);
    blocks.forEach(({ body, mesh, origin }) => {
      body.setTranslation(origin, true); body.setRotation(identity, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true); body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      body.resetForces(true); body.resetTorques(true);
      mesh.position.copy(origin); mesh.quaternion.set(0, 0, 0, 1);
    });
    toolPosition.copy(home); toolBody.setTranslation(home, true); toolBody.setNextKinematicTranslation(home);
    updateArm(); onUpdate(getState());
  }
  function updateWorkspaceCamera(previousCount) {
    if ((previousCount > 5) === (blocks.length > 5)) return;
    if (blocks.length > 5) {
      camera.position.set(11.8, 10.8, 14.8); controls.target.set(0, 1.3, 1.25); controls.maxDistance = 25;
    } else {
      camera.position.set(6.8, 5.9, 7.6); controls.target.set(0, 0.9, 0); controls.maxDistance = 16;
    }
    controls.update();
  }
  function addBlock() {
    if (phase === 'running' || blocks.length >= MAX_BLOCKS) return false;
    const before = blocks.length;
    createBlock(blocks.length); updateWorkspaceCamera(before); reset(); return true;
  }
  function setBlockCount(count) {
    if (phase === 'running' || !Number.isInteger(count) || count < 1 || count > MAX_BLOCKS) return false;
    const before = blocks.length;
    release();
    while (blocks.length < count) createBlock(blocks.length);
    while (blocks.length > count) {
      const block = blocks.pop();
      world.removeRigidBody(block.body);
      block.mesh.traverse(object => object.geometry?.dispose());
      scene.remove(block.mesh);
    }
    updateWorkspaceCamera(before); reset(); return true;
  }
  function deliver() {
    if (phase === 'running') return false;
    if (phase === 'success' || phase === 'stopped') reset();
    completed = 0; beginBlock(0); progress = 0; phase = 'running'; onUpdate(getState()); return true;
  }
  function stop() { release(); phase = 'stopped'; toolBody.setNextKinematicTranslation(toolPosition); onUpdate(getState()); }
  function resize() {
    const width = Math.max(container.clientWidth, 1), height = Math.max(container.clientHeight, 1);
    camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height);
  }
  const observer = new ResizeObserver(resize); observer.observe(container); resize(); updateArm();
  function frame(now) {
    if (disposed) return;
    accumulator += Math.min((now - last) / 1000, 0.1); last = now;
    while (accumulator >= STEP) { step(); accumulator -= STEP; }
    updateArm(); controls.update(); renderer.render(scene, camera);
    frames++;
    if (now - fpsTime >= 300) { fps = Math.round(frames * 1000 / (now - fpsTime)); frames = 0; fpsTime = now; onUpdate(getState()); }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  function dispose() {
    disposed = true; cancelAnimationFrame(raf); observer.disconnect(); controls.dispose();
    scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { const list = Array.isArray(o.material) ? o.material : [o.material]; list.forEach(m => { m.map?.dispose(); m.dispose(); }); } });
    world.free(); queue.free(); renderer.dispose(); renderer.domElement.remove();
    if (window.__simulation === api) delete window.__simulation;
  }
  const api = { deliver, stack: deliver, addBlock, setBlockCount, stop, reset, dispose, getState };
  window.__simulation = api;
  onUpdate(getState());
  return api;
}
