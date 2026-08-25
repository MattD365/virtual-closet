// The 3D fitting room: a parametric mannequin sized from height/weight, and
// garment meshes textured with the user's clothing photos. Everything is
// generated geometry - no model files, nothing fetched.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const BODY_COLOR = 0xd8d4cf;
const BASE_H = 1.75; // canonical figure height in metres; all dims scale from it

export class ClosetScene {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xeceef2);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
    this.camera.position.set(0, 1.35, 3.4);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0.95, 0);
    this.controls.enableDamping = true;
    this.controls.minDistance = 1.4;
    this.controls.maxDistance = 7;
    this.controls.maxPolarAngle = Math.PI * 0.55;

    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(2.5, 4, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    this.scene.add(key);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8892a0, 1.1));

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(1.6, 48).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xdfe2e8 }),
    );
    floor.receiveShadow = true;
    this.scene.add(floor);

    this.figure = new THREE.Group();
    this.scene.add(this.figure);
    this.garments = { top: null, bottom: null, shoes: null };
    this.textures = { top: null, bottom: null, shoes: null };
    this.params = { s: 1, g: 1 };

    this._raf = 0;
    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  resize(w, h) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Rebuild the mannequin from height (cm) and weight (kg). */
  setBody({ heightCm, weightKg }) {
    const h = Math.min(Math.max(heightCm, 120), 220) / 100;
    const bmi = weightKg / (h * h);
    this.params.s = h / BASE_H;
    // girth factor: BMI 22 is the canonical figure; clamp to keep shapes sane
    this.params.g = Math.min(Math.max(bmi / 22, 0.72), 1.65);
    this._buildFigure();
    // garments are sized off the body, so re-dress with the stored textures
    for (const type of ['top', 'bottom', 'shoes']) this._dress(type);
  }

  /** Put a garment photo on the mannequin (dataUrl = null removes it). */
  async wear(type, dataUrl) {
    this.textures[type]?.dispose();
    this.textures[type] = null;
    if (dataUrl) {
      const tex = await new THREE.TextureLoader().loadAsync(dataUrl);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      tex.userData.accent = await dominantColor(dataUrl);
      this.textures[type] = tex;
    }
    this._dress(type);
  }

  /* ------------------------------ mannequin ----------------------------- */

  _buildFigure() {
    this.figure.clear();
    const { s, g } = this.params;
    const mat = new THREE.MeshStandardMaterial({ color: BODY_COLOR, roughness: 0.65 });
    const add = (geo, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x * s * g, y * s, z * s);
      m.castShadow = true;
      this.figure.add(m);
      return m;
    };

    // torso: a lathe through shoulder/chest/waist/hip radii, squashed on z
    const profile = [
      [0.145, 0.0],   // hip
      [0.16, 0.1],
      [0.135, 0.25],  // waist
      [0.165, 0.38],  // chest
      [0.15, 0.47],   // shoulder
      [0.06, 0.5],    // neck root
    ].map(([r, y]) => new THREE.Vector2(r * g, y));
    const torso = add(new THREE.LatheGeometry(profile, 28), 0, 0.95, 0);
    torso.scale.set(s, s, s * 0.72);
    torso.position.x = 0;

    // hips/seat
    const seat = add(new THREE.SphereGeometry(0.15 * g, 24, 16), 0, 0.95, 0);
    seat.scale.set(s, s * 0.6, s * 0.72);
    seat.position.x = 0;

    add(new THREE.CylinderGeometry(0.045 * g, 0.055 * g, 0.09, 16).scale(1, s, 0.85), 0, 1.47, 0)
      .position.x = 0;
    const head = add(new THREE.SphereGeometry(0.1, 24, 18), 0, 1.63, 0);
    head.scale.set(s * 0.92, s * 1.12, s * 0.98);
    head.position.x = 0;

    // arms and legs are capsules; radial size follows girth
    for (const side of [-1, 1]) {
      const arm = add(new THREE.CapsuleGeometry(0.042 * g, 0.5 * s, 6, 14), side * 0.21, 1.12, 0);
      arm.rotation.z = side * -0.1;
      add(new THREE.SphereGeometry(0.05 * g * 0.9, 12, 10), side * 0.245, 0.82, 0.01);
      add(new THREE.CapsuleGeometry(0.06 * g, 0.76 * s, 6, 14), side * 0.09, 0.5, 0);
      const foot = add(new THREE.BoxGeometry(0.095, 0.06, 0.24), side * 0.09, 0.035 * s, 0.05);
      foot.geometry = foot.geometry.clone();
      foot.geometry.translate(0, 0, 0);
    }
  }

  /* ------------------------------ garments ------------------------------ */

  _clearGarment(type) {
    if (this.garments[type]) {
      this.figure.remove(this.garments[type]);
      this.garments[type].traverse((o) => { o.geometry?.dispose(); });
      this.garments[type] = null;
    }
  }

  _dress(type) {
    this._clearGarment(type);
    const tex = this.textures[type];
    if (!tex) return;
    const { s, g } = this.params;
    const group = new THREE.Group();
    const photo = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
    const accent = new THREE.MeshStandardMaterial({ color: tex.userData.accent, roughness: 0.85 });
    const half = (rT, rB, len, thetaStart) =>
      new THREE.Mesh(
        new THREE.CylinderGeometry(rT, rB, len, 24, 1, true, thetaStart, Math.PI),
        photo,
      );

    if (type === 'top') {
      for (const start of [-Math.PI / 2, Math.PI / 2]) {
        const m = half(0.185 * g, 0.175 * g, 0.52, start);
        m.position.y = 1.185 * s;
        m.scale.set(s, s, s * 0.78);
        m.castShadow = true;
        group.add(m);
      }
      for (const side of [-1, 1]) {
        const sleeve = new THREE.Mesh(
          new THREE.CylinderGeometry(0.055 * g, 0.05 * g, 0.2 * s, 14, 1, true), accent);
        sleeve.position.set(side * 0.21 * g * s, 1.3 * s, 0);
        sleeve.rotation.z = side * -0.1;
        group.add(sleeve);
      }
    }

    if (type === 'bottom') {
      for (const start of [-Math.PI / 2, Math.PI / 2]) {
        const hip = half(0.185 * g, 0.17 * g, 0.22, start);
        hip.position.y = 0.87 * s;
        hip.scale.set(s, s, s * 0.78);
        group.add(hip);
      }
      for (const side of [-1, 1]) {
        // each leg wraps one horizontal half of the photo
        const legTex = tex.clone();
        legTex.repeat.set(0.5, 0.72);
        legTex.offset.set(side < 0 ? 0 : 0.5, 0);
        legTex.needsUpdate = true;
        const leg = new THREE.Mesh(
          new THREE.CylinderGeometry(0.075 * g, 0.062 * g, 0.72 * s, 18, 1, true),
          new THREE.MeshStandardMaterial({ map: legTex, roughness: 0.85 }),
        );
        leg.position.set(side * 0.09 * g * s, 0.51 * s, 0);
        leg.castShadow = true;
        group.add(leg);
      }
    }

    if (type === 'shoes') {
      for (const side of [-1, 1]) {
        const shoe = new THREE.Mesh(
          new THREE.BoxGeometry(0.11, 0.085, 0.28),
          [photo, photo, accent, accent, photo, photo],
        );
        shoe.position.set(side * 0.09 * g * s, 0.045 * s, 0.055 * s);
        shoe.castShadow = true;
        group.add(shoe);
      }
    }

    this.garments[type] = group;
    this.figure.add(group);
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    this.controls.dispose();
    this.renderer.dispose();
  }
}

/** Average color of a small resample of the image - used for sleeves, soles. */
function dominantColor(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 8;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, 8, 8);
      const d = ctx.getImageData(0, 0, 8, 8).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      const n = d.length / 4;
      resolve(new THREE.Color(r / n / 255, g / n / 255, b / n / 255));
    };
    img.onerror = () => resolve(new THREE.Color(0x888888));
    img.src = dataUrl;
  });
}
