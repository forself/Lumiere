import assert from 'node:assert/strict';
import {PerspectiveCamera, Scene, Vector3} from '../node_modules/three/build/three.module.js';
import {TourHeadset} from '../src/frontend/tour/TourHeadset.js';

const system = new EventTarget();
Object.defineProperty(globalThis, 'isSecureContext', {value: true});
Object.defineProperty(globalThis, 'navigator', {value: {xr: system}, configurable: true});
globalThis.cancelAnimationFrame = () => {};
system.isSessionSupported = async mode => mode === 'immersive-vr';

class Session extends EventTarget {
  async end() {
    this.ended = true;
    this.dispatchEvent(new Event('end'));
  }
}
function fixture() {
  const xr = {enabled: false, setReferenceSpaceType(type) {assert.equal(type, 'local-floor');}, async setSession() {}};
  const view = {
    renderer: {xr, setAnimationLoop(callback) {this.loop = callback;}, render() {}},
    building: {}, walk: {active: true, keys: new Set(), body: {x: 3, y: 4.65, z: 2}, yaw: .5},
    controls: {enabled: false, target: new Vector3()}, camera: new PerspectiveCamera(), scene: new Scene(),
    interiorMode: 'auto', streetMode: 'auto', frame() {}, resize() {this.resized = true;}
  };
  const messages = [];
  const headset = new TourHeadset(view, message => messages.push(message));
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
console.log('PASS headset: single request, late grant cleanup, denial, failed renderer binding, re-entry, floor origin, end retry and desktop restoration.');
