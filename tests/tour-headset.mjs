import assert from 'node:assert/strict';
import {EventDispatcher, PerspectiveCamera, Scene, Vector3} from '../node_modules/three/build/three.module.js';
import {BuildingStore} from '../src/frontend/designer/building-model.js';
import {sampleProject} from '../src/frontend/designer/model.js';
import {buildBuilding} from '../src/frontend/designer/building-geometry.js';
import {HEADSET_FPS, TourFrameHold} from '../src/frontend/tour/TourFrameHold.js';
import {TourHeadset} from '../src/frontend/tour/TourHeadset.js';

const system = new EventTarget();
Object.defineProperty(globalThis, 'isSecureContext', {value: true});
Object.defineProperty(globalThis, 'navigator', {value: {xr: system}, configurable: true});
globalThis.cancelAnimationFrame = () => {};
system.isSessionSupported = async mode => mode === 'immersive-vr';

class Session extends EventTarget {
  inputSources = [];
  async end() {
    this.ended = true;
    this.dispatchEvent(new Event('end'));
  }
}
function fixture(options) {
  const xr = {enabled: false, setReferenceSpaceType(type) {assert.equal(type, 'local-floor');}, async setSession() {}};
  const view = {
    renderer: {xr, setAnimationLoop(callback) {this.loop = callback;}, render() {}},
    building: {}, walk: {active: true, keys: new Set(), body: {x: 3, y: 4.65, z: 2}, yaw: .5},
    controls: {enabled: false, target: new Vector3()}, camera: new PerspectiveCamera(), scene: new Scene(),
    interiorMode: 'auto', streetMode: 'auto', frame() {}, resize() {this.resized = true;}
  };
  const messages = [];
  const headset = new TourHeadset(view, message => messages.push(message), options);
  return {view, headset, messages};
}

// Destroy while the browser permission prompt is still outstanding. A late grant
// must be returned to the device without touching an already disposed renderer.
{
  const {headset, view} = fixture();
  await headset.refreshSupport();
  let grant, requests = 0;
  system.requestSession = () => {requests++; return new Promise(resolve => {grant = resolve;});};
  headset.enter(); headset.enter();
  assert.equal(requests, 1);
  const closing = headset.destroy(), late = new Session();
  grant(late);
  await closing;
  assert(late.ended);
  assert.equal(view.renderer.xr.enabled, false);
}
{
  const {view, headset, messages} = fixture();
  await headset.refreshSupport();
  system.requestSession = async () => {throw new DOMException('denied', 'NotAllowedError');};
  await headset.enter();
  assert.equal(headset.state, 'idle');
  assert.match(messages.at(-1), /未取得 VR 權限/);

  let session;
  system.requestSession = async (mode, options) => {
    assert.equal(mode, 'immersive-vr');
    assert.deepEqual(options.requiredFeatures, ['local-floor']);
    return session = new Session();
  };
  view.renderer.xr.setSession = async () => {throw Error('WebGL context unavailable');};
  await headset.enter();
  assert(session.ended);
  assert.equal(headset.ownsFrames, false);
  assert.equal(view.renderer.xr.enabled, false);
  assert.match(messages.at(-1), /WebGL context unavailable/);

  view.renderer.xr.setSession = async () => {};
  await headset.enter();
  assert.equal(headset.state, 'active');
  let renderedCamera;
  view.renderer.render = (scene, camera) => {assert.equal(scene, view.scene); renderedCamera = camera;};
  view.renderer.loop(16, {});
  assert.notEqual(renderedCamera, view.camera);
  assert(renderedCamera.parent.position.distanceTo(new Vector3(3, 3, 2)) < 1e-12);
  session.end = async () => {throw Error('busy');};
  await headset.exit();
  assert.equal(headset.state, 'active');
  session.end = Session.prototype.end;
  await session.end();  // headset's own system UI
  assert.equal(headset.state, 'idle');
  assert.equal(view.renderer.loop, null);
  assert.equal(view.interiorMode, 'auto');
  assert.equal(view.controls.enabled, false);
  assert(view.resized);
  await headset.destroy();
}
const tick = () => new Promise(resolve => setTimeout(resolve));
const input = (type, targetRayMode) => Object.assign(new Event(type), {inputSource: {targetRayMode}});

// The browser runs this listener's microtask before Three's own end listener.
// Three still counts the session as presenting then and refuses a size change,
// and afterwards restores the size from before the session. Sizing must wait.
{
  const {view, headset} = fixture();
  await headset.refreshSupport();
  view.renderer.xr = Object.assign(new EventDispatcher(), {
    enabled: false, isPresenting: false, setReferenceSpaceType() {},
    async setSession(session) {
      session.addEventListener('end', () => setTimeout(() => {
        this.isPresenting = false;
        this.dispatchEvent({type: 'sessionend'});
      }));
      this.isPresenting = true;
    }
  });
  let session;
  system.requestSession = async () => session = new Session();
  await headset.enter();
  assert.equal(headset.state, 'active');
  await session.end();
  assert.equal(headset.state, 'idle');
  assert.equal(headset.ownsFrames, false);
  assert(!view.resized, 'no size change while Three is still presenting');
  await tick();
  assert(view.resized, 'the canvas is sized once Three has let go of the session');

  // A session that starts again before Three finishes is left alone.
  view.resized = false;
  await headset.enter();
  await session.end();
  headset.ownsFrames = true;
  await tick();
  assert(!view.resized);
  headset.ownsFrames = false;
  await headset.destroy();
}

// Cardboard: one gaze source, and a screen tap arrives as its select. Looking
// at the floor teleports, with the walker and plan updated through the page.
{
  const store = new BuildingStore(sampleProject()), calls = [];
  const actions = {
    teleport: target => {calls.push(['teleport', target]); return {x: target.x, y: target.ground + 1.65, z: target.z};},
    toggleOpening: (levelId, id) => calls.push(['toggle', levelId, id])
  };
  const {view, headset, messages} = fixture({actions, phone: () => true});
  let rebuilt = 0, pending = false;
  Object.assign(view, {
    building: store.building, design: buildBuilding(store.building),
    walk: {active: true, keys: new Set(), body: {x: -1, y: 1.65, z: -.5}, yaw: Math.PI, pitch: .3},
    syncHeadsetScene() {if (!pending) return false; pending = false; rebuilt++; return true;}
  });
  view.design.group.updateMatrixWorld(true);
  view.controls.enabled = true;
  await headset.refreshSupport();
  let session;
  system.requestSession = async () => {session = new Session(); session.inputSources = [{targetRayMode: 'gaze'}]; return session;};
  await headset.enter();
  assert.match(messages.at(-2), /紙板眼鏡/, 'phone wording while starting');
  assert.match(messages.at(-1), /點一下螢幕可瞬移/);
  const gaze = headset.gaze, rig = headset.rig;
  assert.equal(gaze.enabled, true);
  assert(view.scene.children.includes(rig), 'the rig is drawn so the reticle can hang from the camera');
  let drawn = 0;
  view.renderer.render = () => {drawn++;};

  // Facing south from (-1, -0.5), eyes tipped down at the floor about 1.7 m ahead.
  gaze.camera.position.set(0, 1.6, 0);
  gaze.camera.rotation.x = -.75;
  rig.updateMatrixWorld(true);
  view.renderer.loop(0, {});
  assert.equal(gaze.reticle.visible, true);
  assert.equal(gaze.target.kind, 'floor');
  assert.equal(drawn, 1);

  session.dispatchEvent(input('select', 'tracked-pointer'));
  assert.equal(gaze.transition, null, 'a controller trigger keeps doing nothing');
  session.dispatchEvent(input('select', 'gaze'));
  assert(gaze.transition);
  view.renderer.loop(16, {});
  assert.equal(calls.length, 0);
  pending = true;  // the page marked geometry for rebuilding, as a floor change does
  view.renderer.loop(140, {});
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'teleport');
  assert.equal(calls[0][1].levelId, 'floor-1');
  assert.equal(rebuilt, 1, 'headset frames rebuild changed geometry');
  assert(Math.abs(rig.position.x + 1) < 1e-3 && Math.abs(rig.position.z - calls[0][1].z) < 1e-6, 'the rig moved to the floor point');
  assert(rig.position.z > 1, 'about 1.7 m further south');
  for (const time of [160, 260, 400, 500]) view.renderer.loop(time, {});
  assert.equal(gaze.transition, null);

  // Controllers arriving switch the reticle off; without them it returns.
  session.inputSources = [{targetRayMode: 'gaze'}, {targetRayMode: 'tracked-pointer'}];
  session.dispatchEvent(new Event('inputsourceschange'));
  assert.equal(gaze.enabled, false);
  session.inputSources = [{targetRayMode: 'gaze'}];
  session.dispatchEvent(new Event('inputsourceschange'));
  assert.equal(gaze.enabled, true);

  // Squeeze still leaves. After a teleport the walker stays where it went and
  // faces where the viewer faced.
  view.walk.yaw = 1;
  view.camera.position.set(9, 9, 9);
  session.dispatchEvent(new Event('squeeze'));
  await tick();
  assert.equal(headset.state, 'idle');
  assert.equal(headset.gaze, null);
  assert(!view.scene.children.includes(rig));
  assert(Math.abs(view.walk.yaw - Math.PI) < 1e-6, 'heading carried over');
  assert.equal(view.walk.pitch, 0);
  assert.deepEqual(view.camera.position.toArray(), [9, 9, 9], 'the pre-VR camera is not put back over the new position');
  assert.equal(view.controls.enabled, false, 'still walking');
  assert.equal(view.interiorMode, 'auto');
  assert(view.resized);
  assert.match(messages.at(-1), /停在剛才瞬移到的位置/);
  session.dispatchEvent(input('select', 'gaze'));
  assert.equal(calls.length, 1, 'an ended session no longer acts on taps');

  // Looking at the door instead: the tap operates it, and the old view returns on exit.
  await headset.enter();
  const next = headset.gaze;
  next.camera.position.set(0, 1.6, 0);
  headset.rig.position.set(-1.5, 0, 0);
  headset.rig.rotation.y = 0;
  headset.rig.updateMatrixWorld(true);
  view.renderer.loop(1000, {});
  assert.equal(next.target.kind, 'opening');
  session.dispatchEvent(input('select', 'gaze'));
  assert.deepEqual(calls.at(-1), ['toggle', 'floor-1', 'door-1']);
  view.walk.yaw = 2;
  view.camera.position.set(4, 4, 4);
  await session.end();
  assert.equal(view.walk.yaw, 2);
  assert.deepEqual(view.camera.position.toArray(), [9, 9, 9]);
  assert.match(messages.at(-1), /回到原來的導覽視角/);
  await headset.destroy();
}

// A headset with controllers shows no reticle, and a phone without WebXR gets phone wording.
{
  const {view, headset, messages} = fixture();
  await headset.refreshSupport();
  system.requestSession = async () => Object.assign(new Session(), {inputSources: [{targetRayMode: 'tracked-pointer'}, {targetRayMode: 'tracked-pointer'}]});
  await headset.enter();
  assert.equal(headset.gaze.enabled, false);
  assert.match(messages.at(-1), /握壓控制器側鍵/);
  view.renderer.loop(0, {});
  assert.equal(headset.gaze.reticle.visible, false);
  await headset.destroy();

  const phone = fixture({phone: () => true});
  await phone.headset.refreshSupport();
  phone.headset.available = false;
  phone.headset.enter();
  assert.match(phone.messages.at(-1), /Android 版 Chrome/);
  assert(!/頭顯|握壓/.test(phone.messages.at(-1)));
  await phone.headset.destroy();
}
// A phone viewer must be handed an image on every 60 Hz frame, or that frame is
// black. The scene is drawn 30 times a second and the kept image copied in between.
{
  const target = {width: 1663, height: 756, samples: 4, texture: {colorSpace: 'srgb'}}, calls = [];
  let current = target, failing = false;
  const renderer = {getRenderTarget: () => current, setRenderTarget(next) {current = next;}, render(scene) {if (failing && scene === world) throw Error('lost context'); calls.push([scene, current]);}};
  const hold = new TourFrameHold(renderer), world = new Scene(), camera = new PerspectiveCamera();
  assert.equal(HEADSET_FPS, 30);
  assert.equal(hold.render(world, camera, 1000), true);
  const cache = hold.cache;
  assert.deepEqual(calls, [[world, cache], [hold.copyScene, target]], 'the scene goes into the kept image, which is then copied to the headset');
  assert.equal(current, target, 'the headset target is current again');
  assert.deepEqual([cache.width, cache.height, cache.samples], [1663, 756, 4]);
  assert.equal(cache.isXRRenderTarget, true, 'drawn with the headset\'s tone mapping and output colours');
  assert.equal(cache.texture.internalFormat, 'RGBA8', 'the multisample buffer and its texture share one storage format');
  assert.equal(hold.copy.material.uniforms.map.value, cache.texture);
  assert.equal(hold.render(world, camera, 1016.7), false);
  assert.deepEqual(calls.at(-1), [hold.copyScene, target], 'the frame in between is a copy, not a black frame');
  assert.equal(calls.length, 3);
  assert.equal(hold.render(world, camera, 1031), true, 'a display frame arriving slightly early still counts as due');
  calls.length = 0;
  for (let frame = 1; frame <= 60; frame++) hold.render(world, camera, 2000 + frame * 1000 / 60);
  assert.equal(calls.filter(([scene]) => scene === world).length, 30, 'thirty scene images in a second of 60 Hz frames');
  assert.equal(calls.filter(([scene]) => scene === hold.copyScene).length, 60, 'and an image on every frame');
  calls.length = 0;
  for (let frame = 1; frame <= 10; frame++) hold.render(world, camera, 4000 + frame * 45);
  assert.equal(calls.filter(([scene]) => scene === world).length, 10, 'a phone already slower than 30 fps is not slowed further');

  failing = true;
  assert.throws(() => hold.render(world, camera, 9000), /lost context/);
  assert.equal(current, target, 'a failed draw does not leave the kept image as the target');
  failing = false;
  let released = false;
  cache.addEventListener('dispose', () => {released = true;});
  const larger = {...target, width: 2000};
  current = larger;
  assert.equal(hold.render(world, camera, 9100), true, 'a new target size starts from a fresh image');
  assert(released && hold.cache !== cache && hold.cache.width === 2000);
  current = null;
  calls.length = 0;
  assert.equal(hold.render(world, camera, 9110), true);
  assert.deepEqual(calls, [[world, null]], 'outside a headset target it draws directly');
  hold.dispose();
  assert.equal(hold.cache, null);
}

// The limit applies to phone viewers. A tracked headset keeps drawing every frame.
{
  const {view, headset} = fixture();
  await headset.refreshSupport();
  let session;
  system.requestSession = async () => {session = new Session(); session.inputSources = [{targetRayMode: 'gaze'}]; return session;};
  await headset.enter();
  const target = {width: 1663, height: 756, samples: 4, texture: {colorSpace: 'srgb'}}, drawn = [];
  let current = target;
  Object.assign(view.renderer, {getRenderTarget: () => current, setRenderTarget(next) {current = next;}, render(scene) {drawn.push(scene === view.scene ? 'scene' : 'copy');}});
  for (let frame = 0; frame < 6; frame++) view.renderer.loop(frame * 1000 / 60, {});
  assert.deepEqual(drawn, ['scene', 'copy', 'copy', 'scene', 'copy', 'copy', 'scene', 'copy', 'copy']);
  session.inputSources = [{targetRayMode: 'tracked-pointer'}];
  session.dispatchEvent(new Event('inputsourceschange'));
  drawn.length = 0;
  for (let frame = 6; frame < 9; frame++) view.renderer.loop(frame * 1000 / 60, {});
  assert.deepEqual(drawn, ['scene', 'scene', 'scene']);
  const hold = headset.hold;
  assert(hold.cache);
  await session.end();
  assert.equal(headset.hold, null);
  assert.equal(hold.cache, null, 'the kept image is released with the session');
  await headset.destroy();
}
console.log('PASS headset: single request, late grant cleanup, denial, failed renderer binding, re-entry, floor origin, end retry, desktop restoration, deferred resize, gaze teleport and door taps, controller behaviour, phone wording and the 30 fps phone-viewer frame hold.');
