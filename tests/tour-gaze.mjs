import assert from 'node:assert/strict';
import * as THREE from '../node_modules/three/build/three.module.js';
import {BuildingStore} from '../src/frontend/designer/building-model.js';
import {sampleProject} from '../src/frontend/designer/model.js';
import {buildBuilding} from '../src/frontend/designer/building-geometry.js';
import {gazeTarget, TourGaze} from '../src/frontend/tour/TourGaze.js';

const near = (actual, expected, message, tolerance = 1e-6) => assert(Math.abs(actual - expected) < tolerance, `${message}: ${actual} is not ${expected}`);

// The sample is one 6 x 4 m room: a hinged door in the north wall at x -1.5, a
// fixed window in the east wall, a cabinet at (-2.1, 1.4) and a table at (0.7, 0.6).
const store = new BuildingStore(sampleProject());
const view = {building: store.building, design: buildBuilding(store.building), scene: new THREE.Scene()};
view.design.group.updateMatrixWorld(true);
const look = (from, to) => gazeTarget(view, new THREE.Vector3(...from), new THREE.Vector3(...to).sub(new THREE.Vector3(...from)).normalize());

// What the centre of view would act on.
{
  const floor = look([-1, 1.6, -.5], [-1, 0, 1.2]);
  assert.equal(floor.kind, 'floor');
  assert.equal(floor.levelId, 'floor-1');
  near(floor.x, -1, 'floor x', 1e-3);
  near(floor.z, 1.2, 'floor z', 1e-2);
  near(floor.ground, 0, 'floor height');
  near(floor.distance, Math.hypot(1.6, 1.7), 'distance to the floor', 1e-2);

  // Standing room follows the walk rules: not against a wall, not inside furniture.
  assert.equal(look([1, 1.6, -1.2], [2.85, 0, -1.2]).kind, 'blocked', 'floor within body clearance of a wall');
  assert.equal(look([-1, 1.6, .6], [.7, .75, .6]).kind, 'blocked', 'a table top is not a floor');
  assert.equal(look([-1, 1.6, 0], [-2.1, 0, 1.4]).kind, 'blocked', 'furniture hides the floor it stands on');
  assert.equal(look([0, 1.6, 0], [0, 1.5, -2]).kind, 'blocked', 'a wall');
  assert.equal(look([0, 1.6, 0], [0, 9, 0]).kind, 'none', 'open sky');
  assert.equal(look([-1, .5, -1], [-1, 0, -1]).kind, 'floor', 'straight down at one\'s feet');
  assert.equal(gazeTarget({building: null}, new THREE.Vector3(), new THREE.Vector3(0, -1, 0)).kind, 'none', 'no scene loaded');

  const door = look([-1.5, 1.6, 0], [-1.5, 1, -2]);
  assert.deepEqual({kind: door.kind, id: door.id, levelId: door.levelId, opening: door.opening, open: door.open}, {kind: 'opening', id: 'door-1', levelId: 'floor-1', opening: 'door', open: false});
  assert.equal(look([1, 1.6, 0], [3, 1.5, 0]).kind, 'blocked', 'a fixed window cannot be operated');

  // A level surface overhead with open floor beneath it: the floor is standable,
  // but it is not the surface in view, so a tap must not drop the viewer there.
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(.6, .1, .6), new THREE.MeshBasicMaterial());
  shelf.position.set(-1, 2.25, -1);
  shelf.userData = {id: 'shelf', kind: 'object'};
  view.design.group.add(shelf);
  shelf.updateMatrixWorld(true);
  assert.equal(look([-1, 3, -1], [-1, 0, -1]).kind, 'blocked', 'a surface above the floor');
  view.design.group.remove(shelf);
  shelf.geometry.dispose();
  shelf.material.dispose();

  // Hidden geometry is not in the way.
  const hidden = [];
  view.design.group.traverse(object => {if (object.userData.id === 'object-2') hidden.push(object);});
  assert(hidden.length > 0);
  for (const object of hidden) object.visible = false;
  const beyond = look([-1, 1.6, .6], [.7, .75, .6]);
  assert.equal(beyond.kind, 'floor', 'the ray passes a hidden table');
  near(beyond.x, 2.2, 'floor beyond the hidden table', 1e-2);
  for (const object of hidden) object.visible = true;
}

function fixture() {
  const rig = new THREE.Group(), camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 1.6, 0);
  rig.add(camera);
  view.scene.add(rig);
  const calls = [];
  const actions = {
    teleport: target => {calls.push(['teleport', target]); return {x: target.x, y: target.ground + 1.65, z: target.z, levelId: target.levelId};},
    toggleOpening: (levelId, id) => calls.push(['toggle', levelId, id]),
    notify: message => calls.push(['notify', message])
  };
  const gaze = new TourGaze({view, rig, camera, actions, referenceSpace: () => ({})});
  const stand = (x, z, target) => {
    rig.position.set(x, 0, z);
    rig.updateMatrixWorld(true);
    camera.lookAt(...target);
    rig.updateMatrixWorld(true);
  };
  return {rig, camera, gaze, calls, actions, stand};
}

// Reticle: only for gaze input, riding the surface in view and marking where a tap would land.
{
  const {rig, camera, gaze, stand} = fixture();
  assert(camera.children.includes(gaze.reticle) && camera.children.includes(gaze.fade));
  assert(view.scene.children.includes(gaze.marker));
  stand(-1, -.5, [-1, 0, 1.2]);
  gaze.update(0);
  assert.equal(gaze.reticle.visible, false, 'no reticle without a gaze input source');
  assert.equal(gaze.marker.visible, false);

  gaze.setEnabled(true);
  gaze.update(16);
  gaze.update(116);
  assert.equal(gaze.reticle.visible, true);
  assert.equal(gaze.target.kind, 'floor');
  const distance = Math.hypot(1.6, 1.7);
  near(gaze.reticle.position.z, -(distance - .02), 'reticle sits on the floor in view', 1e-2);
  near(gaze.reticle.scale.x / -gaze.reticle.position.z, .016 * 1.3, 'constant apparent size, enlarged over a target');
  assert.equal(gaze.marker.visible, true);
  near(gaze.marker.position.x, -1, 'marker x', 1e-3);
  near(gaze.marker.position.z, 1.2, 'marker z', 1e-2);
  assert.equal(gaze.ring.material.color.getHex(), 0x7ad69a);
  assert.equal(gaze.word, 'floor');
  for (const mesh of [gaze.ring, gaze.dot, gaze.fade]) assert.equal(mesh.material.depthTest, false, 'overlays draw over the scene');

  stand(0, 0, [0, 1.5, -2]);
  gaze.update(300);
  assert.equal(gaze.target.kind, 'blocked');
  assert.equal(gaze.marker.visible, false);
  assert.equal(gaze.ring.material.color.getHex(), 0xf4f1e8);
  assert.equal(gaze.word, null);
  gaze.update(400);
  near(gaze.reticle.scale.x / -gaze.reticle.position.z, .016, 'plain size off target');

  stand(-1.5, 0, [-1.5, 1, -2]);
  gaze.update(500);
  assert.equal(gaze.target.kind, 'opening');
  assert.equal(gaze.word, 'door-closed');
  assert.equal(gaze.ring.material.color.getHex(), 0xf2b84b);

  // Scans are spaced out; the scene is not ray cast on every headset frame.
  stand(0, 0, [0, 1.5, -2]);
  gaze.update(520);
  assert.equal(gaze.target.kind, 'opening', 'no new scan yet');
  gaze.rescan();
  gaze.update(530);
  assert.equal(gaze.target.kind, 'blocked', 'a rebuilt scene is scanned at once');

  near(gaze.heading(), 0, 'facing north is yaw 0');
  stand(0, 0, [-5, 1.6, 0]);
  near(gaze.heading(), Math.PI / 2, 'facing west is a quarter turn left');
  stand(0, 0, [0, -5, 0]);
  assert.equal(gaze.heading(), null, 'no heading while looking straight down');

  gaze.setEnabled(false);
  assert.equal(gaze.reticle.visible, false);
  gaze.dispose();
  assert(!camera.children.includes(gaze.reticle) && !camera.children.includes(gaze.fade));
  assert(!view.scene.children.includes(gaze.marker));
  view.scene.remove(rig);
}

// A tap on the floor: fade out, move while dark, fade in. The head, not the rig origin, lands on the point.
{
  const {rig, camera, gaze, calls, stand} = fixture();
  gaze.setEnabled(true);
  camera.position.set(.4, 1.6, -.3);  // a tracked headset standing off the rig origin
  stand(-1.4, -.2, [-1, 0, 1.2]);
  gaze.update(0);
  gaze.select({});
  assert.equal(calls.length, 0, 'nothing moves before the view is dark');
  gaze.update(1000);
  assert.equal(gaze.fade.visible, false);
  assert.equal(gaze.reticle.visible, false, 'no aiming during the move');
  gaze.update(1060);
  near(gaze.fade.material.opacity, .5, 'half way to black');
  gaze.select({});
  gaze.update(1119);
  assert.equal(calls.length, 0);
  gaze.update(1120);
  assert.equal(calls.length, 1, 'one teleport, at full black');
  assert.equal(calls[0][0], 'teleport');
  near(calls[0][1].x, -1, 'target x', 1e-3);
  near(calls[0][1].z, 1.2, 'target z', 1e-2);
  assert.equal(gaze.fade.material.opacity, 1);
  const head = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
  near(head.x, -1, 'head x', 1e-3);
  near(head.z, 1.2, 'head z', 1e-2);
  near(rig.position.y, 0, 'rig on the floor');
  assert.equal(gaze.moved, true);

  // The frame that rebuilt the scene may be slow; fading in starts after it.
  gaze.update(1900);
  assert.equal(gaze.fade.material.opacity, 1);
  gaze.update(2000);
  near(gaze.fade.material.opacity, .5, 'half way back');
  gaze.update(2100);
  assert.equal(gaze.fade.visible, false);
  assert.equal(gaze.transition, null);
  gaze.update(2116);
  assert.equal(gaze.reticle.visible, true);
  assert.equal(calls.length, 1);
  gaze.dispose();
  view.scene.remove(rig);
}

// A tap on a door or window operates it at once; a tap on anything else does nothing.
{
  const {rig, gaze, calls, stand} = fixture();
  gaze.setEnabled(true);
  stand(-1.5, 0, [-1.5, 1, -2]);
  gaze.update(0);
  gaze.select({});
  assert.deepEqual(calls, [['toggle', 'floor-1', 'door-1']]);
  assert.equal(gaze.transition, null, 'no fade for a door');
  stand(0, 0, [0, 1.5, -2]);
  gaze.select({});
  stand(1, 0, [3, 1.5, 0]);
  gaze.select({});
  assert.equal(calls.length, 1, 'walls and fixed windows ignore taps');

  // The pose delivered with the tap wins over the last rendered frame.
  const aim = new THREE.PerspectiveCamera();  // like an XR ray, a camera points along -Z
  aim.position.set(0, 1.6, 0);
  aim.lookAt(0, 1, -2);
  aim.updateMatrix();
  stand(-1.5, 0, [-1.5, 1.5, 2]);
  const space = {};
  gaze.select({inputSource: {targetRaySpace: space}, frame: {getPose: (from, to) => from === space && to ? {transform: {matrix: aim.matrix.toArray()}} : null}});
  assert.deepEqual(calls.at(-1), ['toggle', 'floor-1', 'door-1']);
  assert.equal(calls.length, 2);
  gaze.dispose();
  view.scene.remove(rig);
}

// A refused teleport or toggle reports why and leaves the viewer where they were.
{
  const {rig, gaze, calls, actions, stand} = fixture();
  gaze.setEnabled(true);
  actions.teleport = () => {throw Error('此處空間不足');};
  actions.toggleOpening = () => {throw Error('請選擇可開啟的門窗。');};
  stand(-1, -.5, [-1, 0, 1.2]);
  gaze.select({});
  for (const time of [0, 120, 130, 330]) gaze.update(time);
  assert.deepEqual(calls, [['notify', '此處空間不足']]);
  assert.deepEqual(rig.position.toArray(), [-1, 0, -.5]);
  assert.equal(gaze.moved, false);
  assert.equal(gaze.transition, null);
  assert.equal(gaze.fade.visible, false);
  stand(-1.5, 0, [-1.5, 1, -2]);
  gaze.select({});
  assert.deepEqual(calls.at(-1), ['notify', '請選擇可開啟的門窗。']);
  gaze.dispose();
  gaze.select({});
  assert.equal(calls.length, 2, 'a disposed reticle ignores taps');
  view.scene.remove(rig);
}

// An opened door reports its state, so the tap offers to close it.
{
  store.execute({type: 'toggleOpening', id: 'door-1'});
  view.building = store.building;
  view.design = buildBuilding(store.building);
  view.design.group.updateMatrixWorld(true);
  const frame = look([-1.5, 1.6, 0], [-1.5, 2.075, -2]);
  assert.equal(frame.kind, 'opening');
  assert.equal(frame.open, true);
}
console.log('PASS gaze: floor/door/blocked/none targets under the walk rules, reticle depth and size, landing marker, spaced scans, fade teleport with head offset, tap pose, refusals and disposal.');
