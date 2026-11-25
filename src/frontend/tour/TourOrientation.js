import {Euler, MathUtils, Quaternion, Vector3} from '../../../node_modules/three/build/three.module.js';

const RAD = Math.PI / 180;
const PITCH_LIMIT = 1.45;
// Readings closer than this to the frame on screen are sensor noise.
const STEP = .0005;
// A gap this long between applied frames means the view was paused.
const RESUME_MS = 400;
// Frames keep coming this long after the last real movement.
const SETTLE_MS = 250;
const euler = new Euler(), device = new Quaternion(), turn = new Quaternion();
// The camera looks out of the back of the device, not along its top edge.
const backCamera = new Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);
const screenAxis = new Vector3(0, 0, 1), forward = new Vector3(), up = new Vector3();
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const turned = angle => Math.abs(wrap(angle));

// Converts W3C device orientation angles in degrees, plus the screen rotation,
// into the walk controller's yaw and pitch in radians. Roll is dropped so the
// horizon stays level.
export function deviceLook(alpha, beta, gamma, screenAngle = 0) {
  euler.set(beta * RAD, alpha * RAD, -gamma * RAD, 'YXZ');
  device.setFromEuler(euler).multiply(backCamera).multiply(turn.setFromAxisAngle(screenAxis, -screenAngle * RAD));
  forward.set(0, 0, -1).applyQuaternion(device);
  up.set(0, 1, 0).applyQuaternion(device);
  // Looking straight up or down leaves the view direction with no horizontal
  // part, so the screen's top edge takes over the heading near the poles.
  const steep = MathUtils.smoothstep(Math.abs(forward.y), .8, .95);
  const flat = Math.hypot(forward.x, forward.z), edge = Math.hypot(up.x, up.z);
  let x = 0, z = 0;
  if (flat > 1e-6) {
    x += forward.x / flat * (1 - steep);
    z += forward.z / flat * (1 - steep);
  }
  if (steep > 0 && edge > 1e-6) {
    const side = forward.y > 0 ? -1 : 1;
    x += side * up.x / edge * steep;
    z += side * up.z / edge * steep;
  }
  return {yaw: Math.atan2(-x, -z), pitch: Math.asin(MathUtils.clamp(forward.y, -1, 1))};
}

// Lets the phone's orientation sensor turn the walker's head. It writes the same
// yaw and pitch the drag and turn controls use, so movement, collision and the
// plan marker need no second code path.
export class TourOrientation {
  constructor(view, {
    windowTarget = globalThis.window, onChange = () => {}, waitMs = 1500,
    setTimer = (callback, delay) => setTimeout(callback, delay), clearTimer = id => clearTimeout(id)
  } = {}) {
    this.view = view;
    this.window = windowTarget;
    this.onChange = onChange;
    this.waitMs = waitMs;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.state = 'off';
    this.granted = false;
    this.gestureRequired = false;
    this.sample = null;
    this.shown = null;
    this.appliedAt = -Infinity;
    this.movedAt = -Infinity;
    this.timer = null;
    this.handle = this.handle.bind(this);
  }

  get supported() {
    return !!this.window && 'DeviceOrientationEvent' in this.window;
  }

  // True once the browser has refused to ask for permission outside a tap (iOS).
  get needsGesture() {
    return !this.granted && this.gestureRequired;
  }

  get active() {
    return ['asking', 'waiting', 'tracking'].includes(this.state);
  }

  // `gesture` says the call comes straight from a tap. Browsers that guard the
  // sensor answer a permission request: Chrome settles it at once, iOS only
  // inside a tap. An automatic attempt that cannot ask stays off and leaves
  // the request to the button.
  async enable({gesture = false} = {}) {
    if (this.destroyed || this.active) return this.active;
    const Orientation = this.window?.DeviceOrientationEvent;
    if (!Orientation) return this.settle('unavailable');
    if (!this.granted && typeof Orientation.requestPermission === 'function') {
      this.state = 'asking';
      let answer = null;
      try { answer = await Orientation.requestPermission(); }
      catch { /* Not called from a tap, or the prompt was dismissed. */ }
      if (this.destroyed || this.state !== 'asking') return false;
      if (answer === null && !gesture) {
        this.gestureRequired = true;
        return this.settle('off');
      }
      if (answer !== 'granted') return this.settle('denied');
      this.granted = true;
    }
    this.window.addEventListener('deviceorientation', this.handle);
    this.state = 'waiting';
    // Desktop browsers expose the event but never deliver a reading.
    this.timer = this.setTimer(() => {
      this.timer = null;
      if (this.state !== 'waiting') return;
      this.stop();
      this.settle('unavailable');
    }, this.waitMs);
    this.onChange('waiting');
    return true;
  }

  settle(state) {
    this.state = state;
    this.onChange(state);
    return false;
  }

  stop() {
    this.window?.removeEventListener('deviceorientation', this.handle);
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    this.sample = this.shown = null;
    this.appliedAt = -Infinity;
  }

  disable() {
    if (this.destroyed || this.state === 'off') return;
    this.stop();
    this.settle('off');
  }

  handle(event) {
    const {alpha, beta, gamma} = event;
    if (![alpha, beta, gamma].every(Number.isFinite)) return;
    const angle = this.window.screen?.orientation?.angle ?? this.window.orientation;
    this.sample = deviceLook(alpha, beta, gamma, Number.isFinite(angle) ? angle : 0);
    if (this.state === 'waiting') {
      if (this.timer !== null) this.clearTimer(this.timer);
      this.timer = null;
      this.state = 'tracking';
      this.onChange('tracking');
    }
    const shown = this.shown;
    if (this.view.walk?.active && (!shown || turned(this.sample.yaw - shown.yaw) > STEP || Math.abs(this.sample.pitch - shown.pitch) > STEP)) this.view.invalidate();
  }

  // Called by the viewport before each walk frame; true while the sensor drives
  // the view. Only the device's turn since the last frame is added to walk.yaw,
  // so drags, turn buttons and teleports made in between are kept. After a pause
  // (orbit view, VR, a hidden tab) the heading on screen is kept and the device
  // continues from there.
  apply(now) {
    const walk = this.view.walk, sample = this.sample, shown = this.shown;
    if (this.state !== 'tracking' || !sample || !walk?.active) return false;
    const resumed = !shown || now - this.appliedAt > RESUME_MS;
    if (!resumed) walk.yaw += wrap(sample.yaw - shown.yaw);
    if (resumed || turned(sample.yaw - shown.yaw) > STEP || Math.abs(sample.pitch - shown.pitch) > STEP) this.movedAt = now;
    this.appliedAt = now;
    walk.pitch = MathUtils.clamp(sample.pitch, -PITCH_LIMIT, PITCH_LIMIT);
    this.shown = sample;
    return true;
  }

  // While the device is being turned, frames should keep coming at a steady pace
  // instead of waiting on each sensor event, which arrive out of step with the display.
  moving(now) {
    return this.state === 'tracking' && now - this.movedAt < SETTLE_MS;
  }

  destroy() {
    if (this.destroyed) return;
    this.stop();
    this.destroyed = true;
    this.state = 'off';
  }
}
