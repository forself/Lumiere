import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../node_modules/three/build/three.module.js';
import {BuildingStore} from '../src/frontend/designer/building-model.js';
import {sampleProject} from '../src/frontend/designer/model.js';
import {buildBuilding} from '../src/frontend/designer/building-geometry.js';
import {WalkController} from '../src/frontend/designer/walk.js';
import {TourEditor} from '../src/frontend/tour/TourEditor.js';
import {TourPage} from '../src/frontend/tour/TourPage.js';
import {TourViewport} from '../src/frontend/tour/TourViewport.js';
import {GYRO_HINTS, TOUCH_QUERY, TOUR_HINTS, tourHints, touchPrimary} from '../src/frontend/tour/tour-hints.js';

// Touch wording never asks for a wheel, a mouse button or a key.
{
  const absent = /滾輪|右鍵|左鍵|滑鼠|WASD|方向鍵|Esc|鍵盤|雙擊/;
  assert.deepEqual(Object.keys(TOUR_HINTS.touch), Object.keys(TOUR_HINTS.pointer), 'both input modes define the same hints');
  for (const [key, text] of Object.entries(TOUR_HINTS.touch)) assert(!absent.test(text), `touch hint ${key} names a desktop control: ${text}`);
  for (const [key, text] of Object.entries(GYRO_HINTS)) assert(!absent.test(text), `gyro hint ${key} names a desktop control: ${text}`);
  assert.match(TOUR_HINTS.pointer.orbit, /滾輪/, 'desktop wording is unchanged');
  assert.equal(tourHints(true), TOUR_HINTS.touch);
  assert.equal(tourHints(undefined), TOUR_HINTS.pointer);
  const queries = [];
  assert.equal(touchPrimary({matchMedia: query => {queries.push(query); return {matches: true};}}), true);
  assert.deepEqual(queries, [TOUCH_QUERY]);
  assert.equal(touchPrimary({matchMedia: () => ({matches: false})}), false);
  assert.equal(touchPrimary({}), false, 'no media queries means a desktop');
}

// The page definition keeps the desktop text as its default and carries the gyro control.
{
  const definition = JSON.parse(await readFile('definitions/tour.page.json', 'utf8')), nodes = new Map(), parents = new Map();
  (function walk(node, parent = null) {nodes.set(node.id, node); parents.set(node.id, parent); for (const child of node.children || []) walk(child, node.id);})(definition.root);
  assert.equal(nodes.get('tour-help').options.text, TOUR_HINTS.pointer.help);
  assert.equal(nodes.get('tour-empty-note').options.text, TOUR_HINTS.pointer.emptyNote);
  assert.equal(nodes.get('tour-plan-hint').options.text, TOUR_HINTS.pointer.planCaption);
  assert.equal(nodes.get('tour-touch-help').options.text, TOUR_HINTS.pointer.touchHelp);
  const gyro = nodes.get('tour-touch-gyro');
  assert.equal(gyro.component, 'BasicButton');
  assert.equal(gyro.events.onClick, 'gyro.toggle');
  assert.equal(parents.get('tour-touch-gyro'), 'tour-touch-controls', 'shown with the walking pad');
}

// Viewport hints follow the input mode, and the plan canvas hint with them.
{
  const titled = mode => Object.assign(new TourViewport({mode}), {canvas: {}, redraws: 0, invalidate() {this.redraws++;}});
  const plan = titled('plan'), scene = titled('scene');
  plan.setInputMode(true);
  scene.setInputMode(true);
  assert.equal(plan.canvas.title, TOUR_HINTS.touch.planTitle);
  assert.equal(plan.planHint, TOUR_HINTS.touch.planHint);
  assert.equal(scene.canvas.title, TOUR_HINTS.touch.sceneTitle);
  assert.equal(scene.planHint, null);
  assert.equal(plan.redraws, 1, 'the drawn hint is refreshed');
  plan.setInputMode(false);
  assert.equal(plan.canvas.title, TOUR_HINTS.pointer.planTitle);
  assert.equal(plan.planHint, null, 'the desktop plan keeps the shared default hint');
  assert.match(await readFile('src/frontend/designer/DesignViewport.js', 'utf8'), /fillText\(this\.planHint\|\|'選取模式雙擊巡覽 · 滾輪縮放 · 右鍵空白平移'/);
}

// Sensor-driven frames keep the tour's 30 fps limit, which divides evenly into 60, 90 and 120 Hz
// displays; while the phone turns they are requested continuously so the pace stays even.
{
  globalThis.document = {hidden: true};  // the shared frame stops before drawing
  const view = new TourViewport({mode: 'scene'});
  let applied = 0, driving = true, moving = true, requested = 0;
  view.orientation = {apply() {applied++; return driving;}, moving: () => moving};
  view.invalidate = () => {requested++;};
  view.lastRender = 1000;
  view.frame(1017);
  assert.equal(view.lastRender, 1000, 'the sensor does not lift the shared frame limit');
  assert.equal(requested, 1, 'while the phone turns, the next frame is asked for without waiting on a sensor event');
  moving = false;
  view.frame(1034);
  assert.equal(requested, 1, 'a phone at rest stops the frame loop');
  driving = false;
  moving = true;
  view.frame(1050);
  assert.equal(requested, 1, 'frames the sensor is not driving are not kept running');
  view.headset = {ownsFrames: true};
  view.frame(1100);
  assert.equal(applied, 3, 'the sensor does not drive the desktop camera during VR');
  assert.match(await readFile('src/frontend/designer/DesignViewport.js', 'utf8'), /if\(now-this\.lastRender<1000\/30-\.5\)\{this\.invalidate\(\);return;\}/, 'the shared limit is 30 fps');
  delete globalThis.document;

  // In VR the desktop frame is paused; changed geometry is still rebuilt on request.
  let synced = 0;
  const vr = Object.assign(new TourViewport({mode: 'scene'}), {renderer: {}, project: {id: 'design'}, rebuild: false, syncDesign(project) {assert.equal(project.id, 'design'); synced++; this.rebuild = false;}});
  assert.equal(vr.syncHeadsetScene(), false);
  vr.rebuild = true;
  assert.equal(vr.syncHeadsetScene(), true);
  assert.equal(vr.syncHeadsetScene(), false);
  assert.equal(synced, 1);

  // Automatic detail keeps only the furniture near the desktop camera. A door
  // toggled in VR makes the page restore that setting; the headset rebuild must
  // still load every room, because it is not rebuilt as the head moves.
  const modes = [];
  Object.assign(vr, {interiorMode: 'auto', streetMode: 'auto', rebuild: true, syncDesign() {modes.push([this.interiorMode, this.streetMode]); this.rebuild = false;}});
  vr.syncHeadsetScene();
  assert.deepEqual(modes, [['full', 'full']]);
  assert.deepEqual([vr.interiorMode, vr.streetMode], ['auto', 'auto'], 'the desktop setting is left for after the session');
  Object.assign(vr, {rebuild: true, syncDesign() {throw Error('asset budget');}});
  assert.throws(() => vr.syncHeadsetScene(), /asset budget/);
  assert.deepEqual([vr.interiorMode, vr.streetMode], ['auto', 'auto']);
}

// Status messages use the wording for the device in hand.
{
  const notices = [], page = Object.assign(Object.create(TourPage.prototype), {
    building: {activeLevelId: 'floor-1', levels: [{id: 'floor-1'}]}, loading: false, exporting: false, message: text => notices.push(text), observe() {}, syncControls() {},
    scene: {walk: {active: false, body: {}, start() {}, stop() {}}, fit() {}, preset() {}}
  });
  for (const touch of [true, false]) {
    page.touchMode = touch;
    const hints = tourHints(touch);
    page.startWalk();
    assert.equal(notices.at(-1), hints.walk);
    page.orbit();
    assert.equal(notices.at(-1), hints.orbit);
    page.chooseView('top');
    assert.equal(notices.at(-1), '俯視視角' + hints.viewSuffix);
  }
}

// Taps made in a headset go through the page: the same standing rule as a plan
// double-click, the same door command as the object panel.
{
  const store = new BuildingStore(sampleProject()), building = store.building, design = buildBuilding(building);
  const scene = {building, design, camera: new THREE.PerspectiveCamera(), controls: {enabled: true}, width: 800, height: 600, canvas: {focus() {}}, invalidate() {}};
  scene.walk = new WalkController(scene);
  const seen = [], page = Object.assign(Object.create(TourPage.prototype), {building, scene, loading: false, exporting: false, observe: position => seen.push(position)});
  const position = page.headsetTeleport({x: -1, y: 0, z: 1.2, levelId: 'floor-1'});
  assert.deepEqual({x: position.x, y: position.y, z: position.z}, {x: -1, y: 1.65, z: 1.2});
  assert.deepEqual(scene.walk.body, {x: -1, y: 1.65, z: 1.2});
  assert.equal(scene.walk.active, true);
  assert.equal(seen.at(-1), position, 'the plan marker and floor follow');
  assert.throws(() => page.headsetTeleport({x: .7, y: 0, z: .6, levelId: 'floor-1'}), /占用/, 'the table still blocks');
  assert.deepEqual(scene.walk.body, {x: -1, y: 1.65, z: 1.2});
  page.loading = true;
  assert.equal(page.headsetTeleport({x: -1, y: 0, z: -1, levelId: 'floor-1'}), null, 'no movement while a scene is loading');
  page.loading = false;

  let refreshed = 0;
  Object.assign(page, {editor: new TourEditor(building), refreshEdited() {refreshed++; this.building = this.editor.building;}});
  const door = () => page.editor.building.levels[0].design.openings.find(o => o.id === 'door-1');
  assert.equal(door().open, false);
  assert.equal(page.headsetToggleOpening('floor-1', 'door-1'), true);
  assert.equal(door().open, true);
  assert.equal(refreshed, 1);
  assert.equal(page.editor.store.past.length, 1, 'one undo step, like the object panel');
  assert.throws(() => page.headsetToggleOpening('floor-1', 'window-1'), /可開啟的門窗/, 'a fixed window stays shut');
  page.exporting = true;
  assert.equal(page.headsetToggleOpening('floor-1', 'door-1'), false);
  assert.equal(door().open, true);
}

// The gyro button: on and off by tap, and a refusal falls back to touch with a reason.
{
  const notices = [], requests = [];
  const gyro = {active: false, state: 'off', enable(options) {requests.push(options); this.active = true; this.state = 'waiting'; return Promise.resolve(true);}, disable() {this.active = false; this.state = 'off';}};
  let synced = 0;
  const page = Object.assign(Object.create(TourPage.prototype), {building: {}, gyro, scene: {walk: {active: true}}, message: text => notices.push(text), syncControls() {synced++;}});
  page.toggleGyro();
  assert.deepEqual(requests, [{gesture: true}], 'the request is made inside the tap');
  assert.equal(page.gyroWanted, true);
  page.gyroChanged('waiting');
  assert.equal(notices.length, 0);
  page.gyroChanged('tracking');
  assert.equal(notices.at(-1), GYRO_HINTS.on);
  page.gyroChanged('tracking');
  assert.equal(notices.length, 1, 'only a tap is answered with a message');
  page.toggleGyro();
  assert.equal(gyro.active, false);
  assert.equal(page.gyroWanted, false, 'switching it off is remembered, so walking does not switch it back on');
  assert.equal(notices.at(-1), GYRO_HINTS.off);

  page.toggleGyro();
  page.gyroChanged('denied');
  assert.equal(notices.at(-1), GYRO_HINTS.denied);
  gyro.active = false;
  page.toggleGyro();
  page.gyroChanged('unavailable');
  assert.equal(notices.at(-1), GYRO_HINTS.unavailable);
  const count = notices.length;
  page.gyroChanged('denied');
  page.gyroChanged('unavailable');
  assert.equal(notices.length, count, 'an automatic attempt that fails stays quiet');
  assert(synced >= 6, 'the button state follows every change');

  page.scene.walk.active = false;
  gyro.active = false;
  page.toggleGyro();
  assert.equal(requests.length, 3, 'the gyro only turns the head while walking');
}
console.log('PASS phone tour: touch wording without desktop controls, gyro control in the definition, viewport hints, sensor frame pacing, VR geometry sync, headset teleport and door taps through the page, and gyro toggle messages.');
