import {Group} from '../../../node_modules/three/build/three.module.js';
import {walkStart} from '../designer/walk.js';

// The XR camera has its own floor origin. Three updates it from the headset
// pose, leaving the desktop orbit camera and walk controller intact.
export class TourHeadset {
  constructor(view, onChange) {
    this.view = view;
    this.onChange = onChange;
    this.state = 'idle';
    this.available = null;
    this.refreshSupport = this.refreshSupport.bind(this);
    this.exit = this.exit.bind(this);
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
    if (!this.available) {
      this.notify('請在支援 WebXR 的頭顯瀏覽器開啟安全來源（例如 HTTPS），並確認裝置已連線。仍可使用桌面自由走動。');
      return;
    }
    this.ending = null;
    this.state = 'starting';
    this.notify('請在頭顯中確認進入 VR；握壓控制器側鍵可退出。');
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
      renderer.setAnimationLoop((_time, frame) => {
        if (frame && this.session === session) renderer.render(view.scene, camera);
      });
      this.state = 'active';
      this.notify('已進入 VR。握壓控制器側鍵、使用頭顯系統選單，或按「退出 VR」可返回導覽。');
    } catch (error) {
      if (session && this.session === session) {
        try { await session.end(); } catch { /* It may have already ended. */ }
        this.finish(session);
      }
      if (!this.session) this.state = 'idle';
      this.notify(error.name === 'NotAllowedError' ? '未取得 VR 權限，已保留桌面導覽。' : '無法進入 VR：' + error.message);
    }
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
    this.session = null;
    this.state = 'idle';
    this.ownsFrames = false;
    const view = this.view;
    view.renderer.setAnimationLoop(null);
    view.renderer.xr.enabled = false;
    if (this.desktop) {
      view.camera.position.copy(this.desktop.position);
      view.camera.quaternion.copy(this.desktop.orientation);
      view.controls.target.copy(this.desktop.target);
      view.controls.enabled = this.desktop.controls;
      view.interiorMode = this.desktop.interior;
      view.streetMode = this.desktop.street;
      this.desktop = null;
    }
    if (!this.disposed) {
      view.walk.keys.clear();
      view.walk.last = 0;
      view.resize();
      this.notify('已退出 VR，回到原來的導覽視角。');
    }
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
