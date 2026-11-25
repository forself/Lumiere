import assert from 'node:assert/strict';
import {deviceLook, TourOrientation} from '../src/frontend/tour/TourOrientation.js';

const DEG = Math.PI / 180;
const near = (actual, expected, message) => assert(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} is not ${expected}`);

// Device angles to the walker's yaw and pitch. Upright portrait facing the
// reference heading is the neutral pose.
{
  near(deviceLook(0, 90, 0).yaw, 0, 'upright yaw');
  near(deviceLook(0, 90, 0).pitch, 0, 'upright pitch');
  near(deviceLook(40, 90, 0).yaw, 40 * DEG, 'turning left raises yaw');
  near(deviceLook(-40, 90, 0).yaw, -40 * DEG, 'turning right lowers yaw');
  near(deviceLook(0, 60, 0).pitch, -30 * DEG, 'top edge tipped away looks down');
  near(deviceLook(0, 120, 0).pitch, 30 * DEG, 'top edge tipped back looks up');
  // Rolling the upright phone 20° about the view axis reads alpha 90, beta 70,
  // gamma -90. It must not swing the heading or tilt the horizon.
  near(deviceLook(90, 70, -90).yaw, 0, 'roll leaves yaw alone');
  near(deviceLook(90, 70, -90).pitch, 0, 'roll leaves pitch alone');
  // The same upright pose with the device turned to landscape (top edge to the left).
  near(deviceLook(90, 0, -90, 90).yaw, 0, 'landscape yaw');
  near(deviceLook(90, 0, -90, 90).pitch, 0, 'landscape pitch');
  near(deviceLook(120, 0, -90, 90).yaw, 30 * DEG, 'landscape turn');
  // Flat on a table the view points at the floor; the top edge still gives a stable heading.
  near(deviceLook(0, 0, 0).pitch, -90 * DEG, 'flat looks straight down');
  near(deviceLook(0, 0, 0).yaw, 0, 'flat heading');
  near(deviceLook(50, 0, 0).yaw, 50 * DEG, 'flat heading follows the top edge');
  near(deviceLook(50, 180, 0).pitch, 90 * DEG, 'face down looks straight up');
  // In landscape the screen's top is the device's right edge, which points east here.
  near(deviceLook(0, 0, 0, 90).yaw, -90 * DEG, 'flat heading follows the rotated screen');
}

class FakeWindow extends EventTarget {
  constructor(fields = {}) {
    super();
    this.listeners = new Set();
    Object.assign(this, fields);
  }
  get listening() {
    return this.listeners.size;
  }
  addEventListener(type, listener, options) {
    if (type === 'deviceorientation') this.listeners.add(listener);
    super.addEventListener(type, listener, options);
  }
  removeEventListener(type, listener, options) {
    if (type === 'deviceorientation') this.listeners.delete(listener);
    super.removeEventListener(type, listener, options);
  }
  turn(alpha, beta = 90, gamma = 0) {
    this.dispatchEvent(Object.assign(new Event('deviceorientation'), {alpha, beta, gamma}));
  }
}
function fixture(windowFields, options = {}) {
  const timers = new Map();
  let nextTimer = 0;
  const view = {walk: {active: true, yaw: 1, pitch: .2}, drawn: 0, invalidate() {this.drawn++;}};
  const windowTarget = new FakeWindow({DeviceOrientationEvent: function DeviceOrientationEvent() {}, ...windowFields});
  const states = [];
  const sensor = new TourOrientation(view, {
    windowTarget, onChange: state => states.push(state),
    setTimer: callback => {timers.set(++nextTimer, callback); return nextTimer;}, clearTimer: id => timers.delete(id), ...options
  });
  return {view, windowTarget, sensor, states, timers};
}

// Android: no permission step. The current heading is kept when tracking starts,
// then the device turns the same yaw the drag and turn buttons use.
{
  const {view, windowTarget, sensor, states, timers} = fixture();
  assert.equal(sensor.supported, true);
  assert.equal(sensor.needsGesture, false);
  assert.equal(await sensor.enable(), true);
  assert.equal(sensor.state, 'waiting');
  assert.equal(windowTarget.listening, 1);
  assert.equal(sensor.apply(0), false, 'no reading yet');

  windowTarget.dispatchEvent(Object.assign(new Event('deviceorientation'), {alpha: null, beta: null, gamma: null}));
  assert.equal(sensor.state, 'waiting', 'an empty desktop event is not a reading');
  windowTarget.turn(10);
  assert.equal(sensor.state, 'tracking');
  assert.equal(timers.size, 0, 'the first reading cancels the no-sensor timeout');
  assert.deepEqual(states, ['waiting', 'tracking']);
  assert.equal(view.drawn, 1);

  assert.equal(sensor.apply(1000), true);
  near(view.walk.yaw, 1, 'starting to track keeps the current heading');
  near(view.walk.pitch, 0, 'pitch comes from the device at once');
  windowTarget.turn(10);
  assert.equal(view.drawn, 1, 'an unchanged reading does not wake the renderer');
  windowTarget.turn(30);
  assert.equal(view.drawn, 2);
  sensor.apply(1016);
  near(view.walk.yaw, 1 + 20 * DEG, 'device rotation turns the walker');

  // While the phone turns, frames are paced by the display; once it rests they stop.
  assert.equal(sensor.moving(1016), true);
  assert.equal(sensor.moving(1200), true);
  sensor.apply(1200);
  assert.equal(sensor.moving(1300), false, 'an unchanged reading does not count as movement');
  // Crossing the ±180° seam of the reported heading is a small turn, not a full spin.
  windowTarget.turn(179);
  sensor.apply(1310);
  const seam = view.walk.yaw;
  windowTarget.turn(-179);
  sensor.apply(1326);
  near(view.walk.yaw, seam + 2 * DEG, 'the heading stays continuous across the seam');
  windowTarget.turn(30);
  sensor.apply(1342);
  near(view.walk.yaw, 1 + 20 * DEG, 'and returns to where it was');

  // A drag or a turn button changes walk.yaw between frames; the sensor keeps it.
  view.walk.yaw += .5;
  view.walk.pitch = 1;
  sensor.apply(1032);
  near(view.walk.yaw, 1.5 + 20 * DEG, 'manual turning is kept');
  near(view.walk.pitch, 0, 'pitch stays with the device');
  windowTarget.turn(30, 60);
  sensor.apply(1048);
  near(view.walk.pitch, -30 * DEG, 'tilting looks down');
  windowTarget.turn(30, 0);
  sensor.apply(1064);
  assert(view.walk.pitch > -Math.PI / 2 && view.walk.pitch < -1.4, 'pitch stops short of straight down');

  // After a pause (orbit view, VR, hidden tab) the heading on screen is kept.
  view.walk.active = false;
  const drawn = view.drawn;
  windowTarget.turn(100);
  assert.equal(view.drawn, drawn, 'the sensor does not redraw a view it is not driving');
  assert.equal(sensor.apply(1080), false);
  view.walk.active = true;
  view.walk.yaw = -2;
  sensor.apply(5000);
  near(view.walk.yaw, -2, 'resuming does not jump by the rotation made meanwhile');
  windowTarget.turn(110);
  sensor.apply(5016);
  near(view.walk.yaw, -2 + 10 * DEG, 'tracking continues from the kept heading');

  sensor.disable();
  assert.equal(sensor.state, 'off');
  assert.equal(windowTarget.listening, 0);
  assert.equal(sensor.apply(5032), false);
  assert.equal(await sensor.enable(), true, 'it can be switched back on');
  sensor.destroy();
  assert.equal(windowTarget.listening, 0);
  assert.equal(timers.size, 0);
  windowTarget.turn(150);
  assert.equal(sensor.apply(6000), false);
  assert.equal(await sensor.enable(), false, 'a destroyed sensor stays off');
}

// A desktop browser exposes the event but never reports: give up quietly.
{
  const {windowTarget, sensor, states, timers} = fixture();
  await sensor.enable();
  assert.equal(timers.size, 1);
  [...timers.values()][0]();
  assert.equal(sensor.state, 'unavailable');
  assert.equal(windowTarget.listening, 0);
  assert.deepEqual(states, ['waiting', 'unavailable']);
}
{
  const {sensor, states} = fixture({DeviceOrientationEvent: undefined});
  assert.equal(await sensor.enable(), false);
  assert.deepEqual(states, ['unavailable']);
}

// Chrome guards the sensor with a permission it settles without a prompt.
{
  let asked = 0;
  const Orientation = Object.assign(function DeviceOrientationEvent() {}, {requestPermission: async () => {asked++; return 'granted';}});
  const {windowTarget, sensor} = fixture({DeviceOrientationEvent: Orientation});
  assert.equal(await sensor.enable(), true);
  assert.equal(sensor.state, 'waiting');
  sensor.disable();
  await sensor.enable();
  assert.equal(asked, 1, 'a granted permission is not requested again');
  assert.equal(windowTarget.listening, 1);
}

// iOS refuses to ask outside a tap. The automatic attempt stays off without an
// error, and the button's tap gets the real answer.
{
  let answer = () => {throw new DOMException('needs a gesture', 'NotAllowedError');};
  const Orientation = Object.assign(function DeviceOrientationEvent() {}, {requestPermission: async () => answer()});
  const {windowTarget, sensor, states} = fixture({DeviceOrientationEvent: Orientation});
  assert.equal(await sensor.enable(), false);
  assert.equal(sensor.state, 'off');
  assert.equal(sensor.needsGesture, true);
  assert.equal(windowTarget.listening, 0);
  assert.deepEqual(states, ['off']);

  answer = () => 'denied';
  assert.equal(await sensor.enable({gesture: true}), false);
  assert.equal(sensor.state, 'denied', 'a refusal falls back to touch');
  assert.equal(windowTarget.listening, 0);

  answer = () => {throw new DOMException('dismissed', 'NotAllowedError');};
  assert.equal(await sensor.enable({gesture: true}), false);
  assert.equal(sensor.state, 'denied', 'a dismissed prompt is a refusal too');

  answer = () => 'granted';
  assert.equal(await sensor.enable({gesture: true}), true);
  assert.equal(sensor.needsGesture, false);
  assert.equal(windowTarget.listening, 1);
}

// Turning it off while the prompt is open must not start listening afterwards.
{
  let grant;
  const Orientation = Object.assign(function DeviceOrientationEvent() {}, {requestPermission: () => new Promise(resolve => {grant = resolve;})});
  const {windowTarget, sensor} = fixture({DeviceOrientationEvent: Orientation});
  const pending = sensor.enable({gesture: true});
  assert.equal(sensor.state, 'asking');
  sensor.disable();
  grant('granted');
  assert.equal(await pending, false);
  assert.equal(sensor.state, 'off');
  assert.equal(windowTarget.listening, 0);
}

// The reading follows the screen rotation the browser reports.
{
  const {view, windowTarget, sensor} = fixture({screen: {orientation: {angle: 90}}});
  await sensor.enable();
  windowTarget.turn(90, 0, -90);
  sensor.apply(0);
  windowTarget.turn(120, 0, -90);
  sensor.apply(16);
  near(view.walk.yaw, 1 + 30 * DEG, 'landscape rotation');
  near(view.walk.pitch, 0, 'landscape pitch');
}
console.log('PASS orientation: device poses in portrait/landscape/flat, heading kept on start and resume, manual turning kept, noise ignored, permission paths, missing sensor and cleanup.');
