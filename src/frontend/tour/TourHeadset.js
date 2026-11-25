import {Group} from '../../../node_modules/three/build/three.module.js';
import {walkStart} from '../designer/walk.js';
import {TourFrameHold} from './TourFrameHold.js';
import {TourGaze} from './TourGaze.js';
import {tourHints} from './tour-hints.js';

const sources = session => Array.from(session?.inputSources || []);

// The XR camera has its own floor origin. Three updates it from the headset
// pose, leaving the desktop orbit camera and walk controller intact.
export class TourHeadset {
  // `actions.teleport(target)` and `actions.toggleOpening(levelId, id)` let a
  // gaze tap act on the scene owner's data; `phone()` selects phone wording.
  constructor(view, onChange, {actions = {}, phone = () => false} = {}) {
    this.view = view;
    this.onChange = onChange;
    this.actions = actions;
    this.phone = phone;
    this.state = 'idle';
    this.available = null;
    this.refreshSupport = this.refreshSupport.bind(this);
    this.exit = this.exit.bind(this);
    this.onSelect = this.onSelect.bind(this);
    this.onSources = this.onSources.bind(this);
    this.system = globalThis.isSecureContext ? navigator.xr : null;
    this.system?.addEventListener('devicechange', this.refreshSupport);
    this.refreshSupport();
  }

  async refreshSupport() {
    const check = this.supportCheck = {};
    let available = false;
    try { available = !!await this.system?.isSessionSupported('immersive-vr'); }
    catch { /* The browser may block spatial tracking for this document. */ }
    if (this.disposed || this.supportCheck !== check) return;
    this.available = available;
    this.onChange();
  }

  notify(message) {
    if (!this.disposed) this.onChange(message);
  }

  enter() {
    if (this.disposed || this.state !== 'idle' || !this.view.building) return;
    const hints = tourHints(this.phone());
    if (!this.available) {
      this.notify(hints.vrUnavailable);
      return;
    }
    this.ending = null;
    this.state = 'starting';
    this.notify(hints.vrStarting);
    this.starting = this.startSession();
    return this.starting;
  }

  async startSession() {
    const view = this.view;
    let session;
    try {
      const origin = view.walk.body || walkStart(view.building, view.building.activeLevelId);
      // Request synchronously in the click handler to retain user activation.
      session = await this.system.requestSession('immersive-vr', {requiredFeatures: ['local-floor']});
      if (this.disposed) { await session.end(); return; }
      this.session = session;
      session.addEventListener('end', () => queueMicrotask(() => this.finish(session)), {once: true});
      session.addEventListener('squeeze', this.exit);

      this.desktop = {
        controls: view.controls.enabled, interior: view.interiorMode, street: view.streetMode,
        position: view.camera.position.clone(), orientation: view.camera.quaternion.clone(),
        target: view.controls.target.clone()
      };
      view.walk.keys.clear();
      view.controls.enabled = false;
      view.interiorMode = view.streetMode = 'full';
      cancelAnimationFrame(view.frameId);
      view.lastRender = -Infinity;
      view.frame(performance.now());
      cancelAnimationFrame(view.frameId);
      view.frameId = null;
      this.ownsFrames = true;

      const rig = new Group();
      rig.position.set(origin.x, origin.y - 1.65, origin.z);
      rig.rotation.y = view.walk.active ? view.walk.yaw : Math.PI;
      const camera = view.camera.clone(false);
      camera.position.set(0, 0, 0);
      camera.quaternion.identity();
      rig.add(camera);
      rig.updateMatrixWorld(true);

      const renderer = view.renderer;
      renderer.xr.enabled = true;
      renderer.xr.setReferenceSpaceType('local-floor');
      await renderer.xr.setSession(session);
      if (this.disposed || this.session !== session) return;

      // The reticle and fade hang from the XR camera, so the rig joins the scene.
      const gaze = this.gaze = new TourGaze({view, rig, camera, actions: this.actions, referenceSpace: () => renderer.xr.getReferenceSpace?.() || null});
      const hold = this.hold = new TourFrameHold(renderer);
      this.rig = rig;
      view.scene.add(rig);
      this.gazeSeen = false;
      session.addEventListener('select', this.onSelect);
      session.addEventListener('inputsourceschange', this.onSources);
      this.onSources();
      renderer.setAnimationLoop((time, frame) => {
        if (!frame || this.session !== session) return;
        gaze.update(time);
        // Desktop frames are paused; a door toggled or a floor reached in VR
        // still needs its geometry rebuilt before this frame is drawn.
        if (view.syncHeadsetScene?.()) gaze.rescan();
        // A phone viewer gets the tour's 30 images a second; a tracked headset
        // keeps its own display rate, where a held image would be felt at once.
        if (gaze.enabled) hold.render(view.scene, camera, time);
        else renderer.render(view.scene, camera);
      });
      this.state = 'active';
      this.notify(gaze.enabled || this.phone()
        ? '已進入 VR。看著地面點一下螢幕可瞬移，看著門窗點一下可開關；按返回鍵或畫面上的關閉鈕退出。'
        : '已進入 VR。握壓控制器側鍵、使用頭顯系統選單，或按「退出 VR」可返回導覽。');
    } catch (error) {
      if (session && this.session === session) {
        try { await session.end(); } catch { /* It may have already ended. */ }
        this.finish(session);
      }
      if (!this.session) this.state = 'idle';
      this.notify(error.name === 'NotAllowedError' ? '未取得 VR 權限，已保留桌面導覽。' : '無法進入 VR：' + error.message);
    }
  }

  // Cardboard viewers report one gaze source and turn a screen tap into its
  // select. Tracked controllers keep their own behaviour: squeeze to leave.
  onSources() {
    const list = sources(this.session);
    if (list.some(source => source.targetRayMode === 'gaze')) this.gazeSeen = true;
    this.gaze?.setEnabled(this.gazeSeen && !list.some(source => source.targetRayMode === 'tracked-pointer'));
  }

  onSelect(event) {
    if (event.inputSource?.targetRayMode !== 'gaze' || this.state !== 'active') return;
    if (!this.gazeSeen) {
      this.gazeSeen = true;
      this.onSources();
    }
    // With controllers present the reticle is off, and select() then ignores the tap.
    this.gaze?.select(event);
  }

  async exit() {
    if (this.state !== 'active' || !this.session) return;
    this.state = 'ending';
    this.notify();
    const session = this.session;
    try {
      this.ending = session.end();
      await this.ending;
    } catch (error) {
      if (this.session !== session) return;
      this.state = 'active';
      this.notify('無法退出 VR：' + error.message);
    }
  }

  finish(session) {
    if (session !== this.session) return;
    session.removeEventListener('squeeze', this.exit);
    session.removeEventListener('select', this.onSelect);
    session.removeEventListener('inputsourceschange', this.onSources);
    this.session = null;
    this.state = 'idle';
    this.ownsFrames = false;
    const view = this.view, gaze = this.gaze;
    // A teleport already moved the walker, so the view continues from there.
    const moved = !!gaze?.moved && view.walk.active, heading = moved ? gaze.heading() : null;
    gaze?.dispose();
    this.gaze = null;
    this.hold?.dispose();
    this.hold = null;
    if (this.rig) view.scene.remove(this.rig);
    this.rig = null;
    view.renderer.setAnimationLoop(null);
    view.renderer.xr.enabled = false;
    if (this.desktop) {
      if (moved) {
        if (heading !== null) view.walk.yaw = heading;
        view.walk.pitch = 0;
      } else {
        view.camera.position.copy(this.desktop.position);
        view.camera.quaternion.copy(this.desktop.orientation);
      }
      view.controls.target.copy(this.desktop.target);
      view.controls.enabled = moved ? false : this.desktop.controls;
      view.interiorMode = this.desktop.interior;
      view.streetMode = this.desktop.street;
      this.desktop = null;
    }
    if (!this.disposed) {
      view.walk.keys.clear();
      view.walk.last = 0;
      this.restoreSize();
      this.notify(moved ? '已退出 VR，停在剛才瞬移到的位置。' : '已退出 VR，回到原來的導覽視角。');
    }
  }

  // This runs before Three's own end listener. While Three still counts the
  // session as presenting it refuses a size change, and afterwards it restores
  // the size from before the session, which is stale once a phone has turned.
  // So size the canvas only after Three has finished.
  restoreSize() {
    const view = this.view, xr = view.renderer.xr;
    if (!xr.isPresenting || typeof xr.addEventListener !== 'function') {
      view.resize();
      return;
    }
    const resize = () => {
      xr.removeEventListener('sessionend', resize);
      if (!this.disposed && !this.ownsFrames) view.resize();
    };
    xr.addEventListener('sessionend', resize);
  }

  async destroy() {
    this.disposed = true;
    this.system?.removeEventListener('devicechange', this.refreshSupport);
    await this.starting;
    // A route change can overlap a user's exit. Let the first end request
    // release the XR framebuffer before the viewport disposes its context.
    if (this.ending) await this.ending.catch(() => {});
    const session = this.session;
    if (session) {
      try { await session.end(); } catch { /* Browser teardown can end it first. */ }
      this.finish(session);
    }
  }
}
