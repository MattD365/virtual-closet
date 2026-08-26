// The 3D fitting room: a parametric mannequin sized from height/weight, and
// garment meshes textured with the user's clothing photos. Everything is
// generated geometry - no model files, nothing fetched.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const BODY_COLOR = 0xd8d4cf;
const BASE_H = 1.75; // canonical figure height in metres; all dims scale from it
const ARM_ANGLE = 0.75; // A-pose: radians out from vertical, so sleeve length reads

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
    const gl = Math.pow(g, 0.6); // limbs thicken slower than the torso
    const mat = new THREE.MeshStandardMaterial({ color: BODY_COLOR, roughness: 0.5 });

    // smooth silhouettes: spline through control radii, spun into a lathe
    const lathe = (pts, seg = 40) => new THREE.LatheGeometry(
      new THREE.SplineCurve(pts.map(([r, y]) => new THREE.Vector2(r, y))).getPoints(48),
      seg,
    );
    const add = (geo, x, y, z, material = mat) => {
      const m = new THREE.Mesh(geo, material);
      m.position.set(x * s, y * s, z * s);
      m.scale.set(s, s, s);
      m.castShadow = true;
      this.figure.add(m);
      return m;
    };

    // torso: one continuous curve from crotch to neck, elliptical in section
    const torso = add(lathe([
      [0.02, 0.775],
      [0.10, 0.79],
      [0.150, 0.86],  // hip
      [0.145, 0.97],
      [0.122, 1.08],  // waist
      [0.142, 1.20],  // ribs
      [0.152, 1.30],  // chest
      [0.138, 1.38],
      [0.09, 1.44],   // shoulder slope
      [0.052, 1.465], // neck root
      [0.043, 1.55],  // neck top
    ].map(([r, y]) => [r * g, y]), 48), 0, 0, 0);
    torso.scale.set(s, s, s * 0.74);

    // head: rotated so the texture's u-centre (where the face is) looks at +z;
    // the scale axes are swapped to match (local x becomes world depth)
    const head = add(new THREE.SphereGeometry(0.093, 40, 28), 0, 1.65, 0, this._headMaterial());
    head.scale.set(0.97 * s, 1.15 * s, 0.9 * s);
    head.rotation.y = -Math.PI / 2;
    this._head = head;

    for (const side of [-1, 1]) {
      // deltoid blends the arm into the shoulder line
      const deltoid = add(new THREE.SphereGeometry(0.058 * gl, 20, 14), side * 0.150 * g, 1.415, 0);
      deltoid.scale.z = 0.85 * s;

      // arm: shoulder at the lathe origin so the hang angle pivots correctly
      const arm = add(lathe([
        [0.001, -0.60],
        [0.022, -0.585],
        [0.026, -0.52],  // wrist
        [0.034, -0.36],  // forearm
        [0.038, -0.30],  // elbow
        [0.047, -0.14],
        [0.052, -0.04],  // upper arm
        [0.028, 0.0],
        [0.005, 0.01],
      ].map(([r, y]) => [r * gl, y]), 24), side * 0.155 * g, 1.42, 0);
      arm.rotation.z = side * ARM_ANGLE;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.034 * gl, 14, 10), mat);
      hand.position.set(0, -0.63, 0.01);
      hand.scale.set(0.8, 1.35, 0.5);
      hand.castShadow = true;
      arm.add(hand);

      // leg: hip at the origin, smooth thigh/knee/calf taper down to the ankle
      add(lathe([
        [0.005, 0.01],
        [0.075, -0.01],
        [0.092, -0.08],  // thigh
        [0.075, -0.26],
        [0.060, -0.35],  // knee
        [0.066, -0.44],  // calf
        [0.045, -0.60],
        [0.030, -0.70],  // ankle
        [0.001, -0.73],
      ].map(([r, y]) => [r * gl, y]), 28), side * 0.088 * g, 0.80, 0);

      const foot = add(new THREE.SphereGeometry(0.075, 20, 14), side * 0.088 * g, 0.045, 0.06);
      foot.scale.set(0.62 * s, 0.4 * s, 1.5 * s);
    }
  }

  /** Put a face photo on the head (dataUrl = null restores the blank head). */
  async setFace(dataUrl) {
    this._faceTex?.dispose();
    this._faceTex = null;
    if (dataUrl) this._faceTex = await makeHeadTexture(dataUrl);
    if (this._head) {
      this._head.material.dispose();
      this._head.material = this._headMaterial();
    }
  }

  _headMaterial() {
    return this._faceTex
      ? new THREE.MeshStandardMaterial({ map: this._faceTex, roughness: 0.55 })
      : new THREE.MeshStandardMaterial({ color: BODY_COLOR, roughness: 0.5 });
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
        // sit the sleeve a little way down the raised arm, at the same angle
        const ang = side * ARM_ANGLE;
        const sleeve = new THREE.Mesh(
          new THREE.CylinderGeometry(0.062 * g, 0.055 * g, 0.2 * s, 14, 1, true), accent);
        sleeve.position.set(
          (side * 0.155 * g + Math.sin(ang) * 0.14) * s,
          (1.42 - Math.cos(ang) * 0.14) * s,
          0,
        );
        sleeve.rotation.z = ang;
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
          new THREE.CylinderGeometry(0.105 * g, 0.064 * g, 0.72 * s, 18, 1, true),
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

/**
 * Head texture that wraps like a rendered 3D head: the sharp face spans past
 * the ears at the texture's u-centre, and the photo's own blurred tones (skin,
 * hairline) continue around the sides, top and back instead of mannequin grey.
 * The seam sits at the back of the head, mirror-averaged so it doesn't show.
 */
function makeHeadTexture(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const size = 512;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');

      // base coat: the photo blurred out to ambient skin/hair color everywhere
      ctx.fillStyle = '#d8d4cf';
      ctx.fillRect(0, 0, size, size);
      const cover = Math.max(size / img.width, size / img.height);
      ctx.filter = 'blur(40px)';
      ctx.drawImage(img, (size - img.width * cover) / 2, (size - img.height * cover) / 2,
        img.width * cover, img.height * cover);
      ctx.filter = 'none';

      // mirror-average so the left/right texture edges match at the seam
      const mirror = document.createElement('canvas');
      mirror.width = mirror.height = size;
      const mx = mirror.getContext('2d');
      mx.translate(size, 0);
      mx.scale(-1, 1);
      mx.drawImage(c, 0, 0);
      ctx.globalAlpha = 0.5;
      ctx.drawImage(mirror, 0, 0);
      ctx.globalAlpha = 1;

      // sharp face: wraps ~210° of the head, fading softly into the base coat
      const cx = size / 2, cy = size * 0.47;
      const fw = 300, fh = 340;
      const patch = document.createElement('canvas');
      patch.width = patch.height = size;
      const px = patch.getContext('2d');
      const fit = Math.max(fw / img.width, fh / img.height) * 1.05;
      px.drawImage(img, cx - (img.width * fit) / 2, cy - (img.height * fit) / 2,
        img.width * fit, img.height * fit);
      px.globalCompositeOperation = 'destination-in';
      px.save();
      px.translate(cx, cy);
      px.scale(fw / fh, 1);
      const grad = px.createRadialGradient(0, 0, fh * 0.30, 0, 0, fh * 0.52);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      px.fillStyle = grad;
      px.fillRect(-size * 2, -size * 2, size * 4, size * 4);
      px.restore();

      ctx.drawImage(patch, 0, 0);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      resolve(tex);
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
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
