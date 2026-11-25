import {
  BufferAttribute, BufferGeometry, Mesh, RGBAFormat, Scene, ShaderMaterial, UnsignedByteType, Vector2, WebGLRenderTarget
} from '../../../node_modules/three/build/three.module.js';

// A phone viewer refreshes at 60 Hz and has to be given an image on every one
// of those frames: a frame that draws nothing is shown black. To draw the scene
// only 30 times a second, each scene image is kept and copied to the frames in
// between. 30 divides the 60 Hz cleanly; 24 would not.
export const HEADSET_FPS = 30;
// Display frames arrive a little early or late; a frame this close to due is drawn.
const SLACK_MS = 4;

export class TourFrameHold {
  constructor(renderer, {fps = HEADSET_FPS} = {}) {
    this.renderer = renderer;
    this.interval = 1000 / fps;
    this.drawnAt = -Infinity;
    this.cache = null;
    this.size = new Vector2();
    const geometry = new BufferGeometry();
    // One triangle covering the whole target.
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.copy = new Mesh(geometry, new ShaderMaterial({
      uniforms: {map: {value: null}, size: {value: this.size}},
      vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
      // Addressed by pixel, so each eye's viewport copies its own part of the kept image.
      fragmentShader: 'uniform sampler2D map; uniform vec2 size; void main() { gl_FragColor = texture2D(map, gl_FragCoord.xy / size); }',
      depthTest: false, depthWrite: false, toneMapped: false
    }));
    this.copy.frustumCulled = false;
    this.copyScene = new Scene();
    this.copyScene.add(this.copy);
  }

  // The kept image is drawn exactly as the headset's own target would be, with
  // tone mapping and output colours applied, so copying it changes nothing.
  cacheFor(target) {
    const cache = this.cache;
    if (cache && cache.width === target.width && cache.height === target.height && cache.samples === target.samples) return cache;
    cache?.dispose();
    // The explicit storage format keeps the multisample buffer and the texture
    // it resolves into identical; the values held are already display colours.
    this.cache = new WebGLRenderTarget(target.width, target.height, {format: RGBAFormat, type: UnsignedByteType, internalFormat: 'RGBA8', colorSpace: target.texture.colorSpace, samples: target.samples});
    this.cache.isXRRenderTarget = true;
    this.copy.material.uniforms.map.value = this.cache.texture;
    this.size.set(target.width, target.height);
    this.drawnAt = -Infinity;
    return this.cache;
  }

  // Call on every headset frame. Returns true when the scene itself was drawn.
  render(scene, camera, time) {
    const renderer = this.renderer, target = renderer.getRenderTarget?.();
    if (!target) {
      renderer.render(scene, camera);
      return true;
    }
    const cache = this.cacheFor(target), due = time - this.drawnAt >= this.interval - SLACK_MS;
    if (due) {
      this.drawnAt = time;
      renderer.setRenderTarget(cache);
      try { renderer.render(scene, camera); }
      finally { renderer.setRenderTarget(target); }
    }
    renderer.render(this.copyScene, camera);
    return due;
  }

  dispose() {
    this.cache?.dispose();
    this.cache = null;
    this.copy.geometry.dispose();
    this.copy.material.dispose();
  }
}
