import {
  BackSide, CanvasTexture, CircleGeometry, Group, MathUtils, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry,
  Raycaster, RingGeometry, SphereGeometry, SRGBColorSpace, Vector3
} from '../../../node_modules/three/build/three.module.js';
import {floorElevation} from '../designer/building-model.js';
import {openingStyle} from '../designer/openings.js';
import {walkDestination} from '../designer/walk.js';

const EYE = 1.65;
// Reticle radius as a fraction of its distance: about one degree of view.
const RING = .016;
const NEAR = .45, FAR = 12, REST = 3;
const FADE_OUT = 120, FADE_IN = 200, SCAN_MS = 90;
const COLORS = {idle: 0xf4f1e8, floor: 0x7ad69a, opening: 0xf2b84b};
const WORDS = {floor: '瞬移', 'door-closed': '開門', 'door-open': '關門', 'window-closed': '開窗', 'window-open': '關窗'};
const raycaster = new Raycaster(), normal = new Vector3(), origin = new Vector3(), direction = new Vector3(), head = new Vector3(), matrix = new Matrix4();
const shown = object => { for (let o = object; o; o = o.parent) if (!o.visible) return false; return true; };
const owner = (object, key) => { for (let o = object; o; o = o.parent) if (o.userData?.[key]) return o.userData[key]; return null; };

function levelAt(building, y) {
  let level = building.levels[0];
  for (const candidate of building.levels) if (floorElevation(building, candidate.id) <= y + .05) level = candidate;
  return level;
}

// What a tap would do for a ray leaving the eyes: stand on the floor it meets,
// operate the door or window it meets, or nothing. Floors go through
// walkDestination, the clearance rule a plan double-click uses.
export function gazeTarget(view, from, toward, far = 40) {
  const building = view.building, group = view.design?.group;
  if (!building || !group) return {kind: 'none'};
  raycaster.set(from, toward);
  raycaster.far = far;
  const hit = raycaster.intersectObject(group, true).find(h => h.object.isMesh && !h.object.userData.nonBlocking && h.object.userData.kind !== 'opening-marker' && shown(h.object));
  if (!hit) return {kind: 'none'};
  const data = hit.object.userData, point = hit.point.clone(), distance = hit.distance;
  const level = building.levels.find(l => l.id === owner(hit.object, 'floorId')) || levelAt(building, point.y);
  const opening = ['door', 'window'].includes(data.kind) ? level.design.openings.find(o => o.id === data.id) : null;
  if (opening) {
    if (openingStyle(opening).motion === 'fixed') return {kind: 'blocked', point, distance};
    return {kind: 'opening', point, distance, levelId: level.id, id: opening.id, opening: opening.kind, open: !!opening.open};
  }
  // Only the upper side of a roughly level surface can be stood on.
  if (hit.face && normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).y > .65 && toward.dot(normal) < 0) {
    try {
      const position = walkDestination(building, {x: point.x, z: point.z}, level.id);
      // Room to stand on a different surface above or below is not what was pointed at.
      if (Math.abs(position.y - EYE - point.y) <= .3) return {kind: 'floor', point, distance, levelId: level.id, x: point.x, y: point.y, z: point.z, ground: position.y - EYE};
    } catch { /* No floor here, or no room for a body: reported as blocked. */ }
  }
  return {kind: 'blocked', point, distance};
}

function overlay(geometry, color, order, opacity = 1) {
  const mesh = new Mesh(geometry, new MeshBasicMaterial({color, transparent: true, opacity, depthTest: false, depthWrite: false, fog: false, toneMapped: false}));
  mesh.renderOrder = order;
  mesh.frustumCulled = false;
  return mesh;
}

// The DOM is not visible inside a headset, so the action word is drawn into the scene.
function wordPanel() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 112;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const mesh = overlay(new PlaneGeometry(4.6, 2), 0xffffff, 9002);
  mesh.material.map = texture;
  mesh.position.y = -2.5;
  mesh.visible = false;
  return {mesh, write(text) {
    context.clearRect(0, 0, 256, 112);
    context.fillStyle = 'rgba(24,30,28,.84)';
    context.beginPath();
    if (context.roundRect) context.roundRect(0, 0, 256, 112, 30); else context.rect(0, 0, 256, 112);
    context.fill();
    context.fillStyle = '#f4f1e8';
    context.font = '600 66px "Noto Sans TC","Microsoft JhengHei",sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, 128, 60);
    texture.needsUpdate = true;
  }};
}

// Cardboard-style control for a headset session: a reticle at the centre of
// view, and one tap that either teleports to the floor in view or operates the
// door or window in view. The scene owner performs both through `actions`.
export class TourGaze {
  constructor({view, rig, camera, actions = {}, referenceSpace = () => null}) {
    this.view = view;
    this.rig = rig;
    this.camera = camera;
    this.actions = actions;
    this.referenceSpace = referenceSpace;
    this.enabled = false;
    this.moved = false;
    this.target = {kind: 'none'};
    this.depth = REST;
    this.scanned = -Infinity;
    this.time = null;
    this.transition = null;
    this.word = null;

    this.ring = overlay(new RingGeometry(.7, .9, 48), COLORS.idle, 9001);
    this.dot = overlay(new CircleGeometry(.14, 24), COLORS.idle, 9001);
    this.reticle = new Group();
    // Dark rims keep the light ring readable against pale walls.
    this.reticle.add(overlay(new RingGeometry(.58, 1, 48), 0x1c2320, 9000, .8), overlay(new CircleGeometry(.24, 24), 0x1c2320, 9000, .8), this.ring, this.dot);
    this.panel = wordPanel();
    if (this.panel) this.reticle.add(this.panel.mesh);
    this.reticle.visible = false;

    this.marker = new Mesh(new RingGeometry(.2, .28, 48), new MeshBasicMaterial({color: COLORS.floor, transparent: true, opacity: .9, depthWrite: false, fog: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2}));
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;

    this.fade = overlay(new SphereGeometry(.3, 24, 16), 0x000000, 9100, 0);
    this.fade.material.side = BackSide;
    this.fade.visible = false;

    camera.add(this.reticle, this.fade);
    view.scene.add(this.marker);
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
    if (!this.enabled) this.reticle.visible = this.marker.visible = false;
  }

  // Geometry changed under the reticle; look again on the next frame.
  rescan() {
    this.scanned = -Infinity;
  }

  ray() {
    return [origin.setFromMatrixPosition(this.camera.matrixWorld), direction.set(0, 0, -1).transformDirection(this.camera.matrixWorld)];
  }

  // The pose that came with the tap is newer than the last rendered frame.
  eventRay(event) {
    const space = this.referenceSpace(), source = event?.inputSource;
    const pose = space && source?.targetRaySpace ? event.frame?.getPose?.(source.targetRaySpace, space) : null;
    if (!pose) return null;
    matrix.fromArray(pose.transform.matrix).premultiply(this.rig.matrixWorld);
    return [origin.setFromMatrixPosition(matrix), direction.set(0, 0, -1).transformDirection(matrix)];
  }

  // Where the viewer faces, as a walk yaw; null while looking straight up or down.
  heading() {
    direction.set(0, 0, -1).transformDirection(this.camera.matrixWorld);
    return Math.hypot(direction.x, direction.z) > .2 ? Math.atan2(-direction.x, -direction.z) : null;
  }

  show(target) {
    this.target = target;
    const style = target.kind === 'floor' || target.kind === 'opening' ? target.kind : 'idle';
    this.ring.material.color.setHex(COLORS[style]);
    this.dot.material.color.setHex(COLORS[style]);
    this.marker.visible = this.enabled && !this.transition && target.kind === 'floor';
    if (target.kind === 'floor') this.marker.position.set(target.x, target.ground + .015, target.z);
    const word = target.kind === 'floor' ? 'floor' : target.kind === 'opening' ? target.opening + (target.open ? '-open' : '-closed') : null;
    if (word === this.word) return;
    this.word = word;
    if (!this.panel) return;
    this.panel.mesh.visible = !!word;
    if (word) this.panel.write(WORDS[word]);
  }

  // Call once per headset frame, before the scene is drawn.
  update(time) {
    const elapsed = this.time === null ? 0 : MathUtils.clamp(time - this.time, 0, 100);
    this.time = time;
    this.advance(time);
    const aiming = this.enabled && !this.transition;
    this.reticle.visible = aiming;
    if (!aiming) {
      this.marker.visible = false;
      return;
    }
    if (time - this.scanned >= SCAN_MS) {
      this.scanned = time;
      this.show(gazeTarget(this.view, ...this.ray()));
    }
    // The ring rides the view every frame; only its depth waits for the scan.
    const goal = MathUtils.clamp((this.target.distance ?? REST) - .02, NEAR, FAR);
    this.depth += (goal - this.depth) * Math.min(1, elapsed / 70);
    const acting = this.target.kind === 'floor' || this.target.kind === 'opening';
    this.reticle.position.set(0, 0, -this.depth);
    this.reticle.scale.setScalar(this.depth * RING * (acting ? 1.3 : 1));
  }

  // A tap while looking at something.
  select(event) {
    if (this.disposed || this.transition || !this.view.building) return;
    const target = gazeTarget(this.view, ...(this.eventRay(event) || this.ray()));
    this.show(target);
    if (target.kind === 'floor') {
      // A short dip to black hides the jump, which is what unsettles people.
      this.transition = {phase: 'out', started: null, target};
      this.marker.visible = false;
    } else if (target.kind === 'opening') {
      this.attempt(() => this.actions.toggleOpening?.(target.levelId, target.id));
      this.rescan();
    }
  }

  attempt(action) {
    try { return action(); }
    catch (error) { this.actions.notify?.(error.message); return null; }
  }

  advance(time) {
    const step = this.transition;
    if (!step) return;
    // Each phase starts on the frame after it was requested, so a slow frame
    // (the scene rebuilding at the destination) is not counted as fade time.
    if (step.started === null) step.started = time;
    const elapsed = time - step.started;
    if (step.phase === 'out') {
      this.setFade(elapsed / FADE_OUT);
      if (elapsed < FADE_OUT) return;
      this.arrive(step.target);
      step.phase = 'in';
      step.started = null;
    } else {
      this.setFade(1 - elapsed / FADE_IN);
      if (elapsed >= FADE_IN) this.transition = null;
    }
  }

  setFade(value) {
    const opacity = MathUtils.clamp(value, 0, 1);
    this.fade.material.opacity = opacity;
    this.fade.visible = opacity > 0;
  }

  arrive(target) {
    const position = this.attempt(() => this.actions.teleport?.(target));
    if (!position) return;
    // A tracked headset may stand away from the rig origin: put the head, not
    // the origin, over the chosen point.
    head.setFromMatrixPosition(this.camera.matrixWorld);
    this.rig.position.x += position.x - head.x;
    this.rig.position.z += position.z - head.z;
    this.rig.position.y = position.y - EYE;
    this.rig.updateMatrixWorld(true);
    this.moved = true;
    this.rescan();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.transition = null;
    this.camera.remove(this.reticle, this.fade);
    this.view.scene.remove(this.marker);
    for (const root of [this.reticle, this.fade, this.marker]) root.traverse(object => {
      if (!object.isMesh) return;
      object.geometry.dispose();
      object.material.map?.dispose();
      object.material.dispose();
    });
  }
}
