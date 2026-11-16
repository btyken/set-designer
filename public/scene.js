// 3D preview of a room set. One unit in the scene is one centimetre.
// Origin is the centre of the set floor; the back wall is at z = -depth / 2.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const loader = new THREE.TextureLoader();
const FOV = 32;

function labelSprite(text, color = '#ffffff') {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = '600 28px "Albert Sans", system-ui, sans-serif';
  ctx.font = font;
  c.width = Math.ceil(ctx.measureText(text).width) + 28;
  c.height = 44;
  ctx.font = font;
  ctx.fillStyle = 'rgba(15,13,12,0.78)';
  ctx.beginPath();
  ctx.roundRect(0, 0, c.width, c.height, 8);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 14, c.height / 2 + 1);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.userData.aspect = c.width / c.height;
  sprite.renderOrder = 10;
  return sprite;
}

// Light grey plank or mottled texture; the floor colour tints it.
function floorTexture(finish) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f4f4f4';
  ctx.fillRect(0, 0, 512, 512);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  if (finish === 'wood') {
    for (let row = 0; row < 8; row++) {
      let x = -rnd() * 200;
      while (x < 512) {
        const len = 160 + rnd() * 200;
        const v = 215 + Math.round(rnd() * 40);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(x, row * 64, len - 2, 62);
        for (let g = 0; g < 5; g++) {
          ctx.fillStyle = `rgba(0,0,0,${0.02 + rnd() * 0.03})`;
          ctx.fillRect(x, row * 64 + rnd() * 60, len - 2, 1);
        }
        x += len;
      }
    }
  } else if (finish !== 'paper') {
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.035)';
      ctx.beginPath();
      ctx.arc(rnd() * 512, rnd() * 512, 4 + rnd() * 30, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

export class SetScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 5, 9000);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.03;
    // On touch screens an up/down swipe scrolls the page; a sideways swipe turns the set.
    if (matchMedia('(pointer: coarse)').matches) canvas.style.touchAction = 'pan-y';
    this.onScreen = true;
    new IntersectionObserver(([entry]) => { this.onScreen = entry.isIntersecting; }).observe(canvas);
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.textures = new Map();
    this.showLabels = true;
    this.showLights = true;
    this.labels = [];
    this.gizmos = [];
    this.billboards = [];
    this.shots = [];
    this.token = 0;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas.parentElement);
    this.resize();
    const tick = () => {
      this.raf = requestAnimationFrame(tick);
      if (!canvas.clientWidth || this.busy || !this.onScreen || document.hidden) return;
      this.controls.update();
      this.face(this.camera);
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  resize() {
    const el = this.canvas.parentElement;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  clear() {
    this.group.traverse((o) => {
      o.geometry?.dispose();
      for (const m of [].concat(o.material || [])) {
        if (m.map && !m.map.userData.keep) m.map.dispose();
        m.dispose();
      }
    });
    this.group.clear();
    this.labels = [];
    this.gizmos = [];
    this.billboards = [];
  }

  async texture(url) {
    if (!this.textures.has(url)) {
      const tex = await loader.loadAsync(url);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      tex.userData.keep = true;
      this.textures.set(url, tex);
    }
    return this.textures.get(url);
  }

  /** Builds the set. Resolves once item photos are loaded, so mockups can be rendered. */
  async setDesign(design, items, brief) {
    const token = ++this.token;
    const used = design.placements.map((p) => items.find((it) => it.id === p.item_id)).filter(Boolean);
    await Promise.all(used.map((it) => this.texture(it.cut || it.thumb).catch(() => null)));
    if (token !== this.token) return false;

    this.clear();
    const W = brief.roomW;
    const D = brief.roomD;
    this.W = W;
    this.D = D;
    this.brief = brief;
    const g = this.group;
    const k = design.scale || 1; // 1 for a room set, smaller for a tabletop set
    this.k = k;
    const wallColor = new THREE.Color(design.wall_color);
    this.scene.background = wallColor.clone().multiplyScalar(0.6);
    this.scene.environmentIntensity = ((design.ambient_pct ?? 40) / 100) * 0.55;

    // Floor and back wall extend well past the set so every frame is filled.
    const floorTex = floorTexture(design.floor_finish);
    floorTex.repeat.set((W * 6) / 240, (D * 6) / 240);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 6, D * 6),
      new THREE.MeshStandardMaterial({ color: design.floor_color, map: floorTex, roughness: design.floor_finish === 'wood' ? 0.55 : 0.8 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = D * 2.5;
    floor.receiveShadow = true;
    g.add(floor);
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 6, 700),
      new THREE.MeshStandardMaterial({ color: design.wall_color, roughness: 0.95 }),
    );
    wall.position.set(0, 350, -D / 2);
    wall.receiveShadow = true;
    g.add(wall);
    const skirting = new THREE.Mesh(
      new THREE.BoxGeometry(W * 6, 9, 1.6),
      new THREE.MeshStandardMaterial({ color: wallColor.clone().lerp(new THREE.Color('#ffffff'), 0.25), roughness: 0.7 }),
    );
    skirting.position.set(0, 4.5, -D / 2 + 0.8);
    if (design.set_type !== 'tabletop') g.add(skirting);

    for (const f of design.furniture || []) g.add(this.furniture(f));

    let heroPos = null;
    const points = [];
    for (const p of design.placements) {
      const it = items.find((o) => o.id === p.item_id);
      if (!it) continue;
      const obj = this.item(it);
      obj.position.set(p.x_cm, p.y_cm, p.z_cm);
      obj.rotation.y = THREE.MathUtils.degToRad(p.rotation_deg || 0);
      g.add(obj);
      const centre = new THREE.Vector3(p.x_cm, p.y_cm + it.h / 2, p.z_cm);
      points.push({ centre, it });
      if (it.hero) heroPos = centre;
      const label = labelSprite((it.hero ? '★ ' : it.product ? '☆ ' : '') + (it.name || 'Item'));
      label.position.set(p.x_cm, p.y_cm + it.h + 9 * k, p.z_cm);
      this.addLabel(label, 8 * k);
    }

    let personPos = null;
    if (design.person?.present) {
      const seated = design.person.pose === 'seated';
      g.add(this.person(design.person, seated));
      personPos = new THREE.Vector3(design.person.x_cm, seated ? 105 : 140, design.person.z_cm);
      const label = labelSprite('Person');
      label.position.set(design.person.x_cm, seated ? 142 : 184, design.person.z_cm);
      this.addLabel(label, 8);
    }

    design.lights.forEach((l, i) => {
      const color = new THREE.Color(l.color_hex);
      const pos = new THREE.Vector3(l.x_cm, Math.max(l.y_cm, 5 * k), l.z_cm);
      const target = l.aim === 'backdrop' ? new THREE.Vector3(l.x_cm * 0.4, 130 * k, -D / 2)
        : l.aim === 'person' && personPos ? personPos.clone()
          : l.aim === 'hero' && heroPos ? heroPos.clone()
            : new THREE.Vector3(0, 80 * k, -D * 0.1);
      const strength = { key: 2.3, fill: 0.7, rim: 2.2, background: 2.4, accent: 2 }[l.role] || 1.8;
      const spot = new THREE.SpotLight(color, (l.intensity_pct / 100) * strength, 0, l.aim === 'backdrop' ? 1.15 : 0.62, 0.9, 0);
      spot.position.copy(pos);
      spot.target.position.copy(target);
      if (l.role === 'key') {
        spot.castShadow = true;
        spot.shadow.mapSize.set(2048, 2048);
        spot.shadow.camera.near = 20 * k;
        spot.shadow.camera.far = 1600;
        spot.shadow.bias = -0.0004;
        spot.shadow.normalBias = 0.6 * k;
      }
      g.add(spot, spot.target);

      const giz = new THREE.Group();
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(6 * k, 16, 12), new THREE.MeshBasicMaterial({ color }));
      bulb.position.copy(pos);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([pos, target]),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 }),
      );
      giz.add(bulb, line);
      g.add(giz);
      this.gizmos.push(giz);
      const label = labelSprite(`${i + 1} ${l.name}`, '#' + color.clone().lerp(new THREE.Color('#ffffff'), 0.45).getHexString());
      label.position.copy(pos).add(new THREE.Vector3(0, 13 * k, 0));
      label.userData.isLight = true;
      this.addLabel(label, 7 * k);
    });

    // The wide shot frames what is actually dressed, not the empty floor.
    const box = new THREE.Box3();
    for (const f of design.furniture || []) {
      box.expandByPoint(new THREE.Vector3(f.x_cm - f.w_cm / 2, 0, f.z_cm));
      box.expandByPoint(new THREE.Vector3(f.x_cm + f.w_cm / 2, f.h_cm, f.z_cm));
    }
    for (const p of points) {
      box.expandByPoint(p.centre.clone().add(new THREE.Vector3(-p.it.w / 2, -p.it.h / 2, 0)));
      box.expandByPoint(p.centre.clone().add(new THREE.Vector3(p.it.w / 2, p.it.h / 2, 0)));
    }
    if (personPos) box.expandByPoint(new THREE.Vector3(personPos.x, design.person.pose === 'seated' ? 140 : 182, personPos.z));
    if (box.isEmpty()) box.set(new THREE.Vector3(-W / 2, 0, -D / 2), new THREE.Vector3(W / 2, 150 * k, 0));
    this.bounds = box;
    this.planShots(points, heroPos, personPos);
    this.applyVisibility();
    this.setView('shot');
    return true;
  }

  addLabel(sprite, height) {
    if (window.innerWidth < 640) height *= 1.3; // keep names readable on a phone
    sprite.scale.set(height * sprite.userData.aspect, height, 1);
    this.group.add(sprite);
    this.labels.push(sprite);
  }

  box(w, h, d, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    return m;
  }

  furniture(f) {
    const grp = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: f.color_hex || '#e9e6e0', roughness: 0.62 });
    const { w_cm: w, d_cm: d, h_cm: h } = f;
    if (f.type === 'table') {
      grp.add(this.box(w, 4, d, mat, 0, h - 2, 0));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) grp.add(this.box(5, h - 4, 5, mat, sx * (w / 2 - 7), (h - 4) / 2, sz * (d / 2 - 7)));
    } else if (f.type === 'shelf') {
      grp.add(this.box(3, h, d, mat, -w / 2 + 1.5, h / 2, 0), this.box(3, h, d, mat, w / 2 - 1.5, h / 2, 0));
      for (const y of [4, ...(f.levels_cm || [h])]) grp.add(this.box(w - 6, 3, d, mat, 0, y - 1.5, 0));
    } else if (f.type === 'side_table') {
      const top = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, 3, 40), mat);
      top.position.y = h - 1.5;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, h - 5, 16), mat);
      leg.position.y = (h - 5) / 2 + 2;
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(w / 3.2, w / 3.2, 2, 32), mat);
      foot.position.y = 1;
      for (const m of [top, leg, foot]) m.castShadow = m.receiveShadow = true;
      grp.add(top, leg, foot);
    } else if (f.type === 'chair') {
      grp.add(this.box(w, 4, d, mat, 0, 44, 0), this.box(w, h - 46, 4, mat, 0, 46 + (h - 46) / 2, -d / 2 + 2));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) grp.add(this.box(4, 42, 4, mat, sx * (w / 2 - 4), 21, sz * (d / 2 - 4)));
    } else {
      grp.add(this.box(w, h, d, mat, 0, h / 2, 0));
    }
    grp.position.set(f.x_cm, 0, f.z_cm);
    grp.rotation.y = THREE.MathUtils.degToRad(f.rotation_deg || 0);
    return grp;
  }

  person(p, seated) {
    const grp = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: '#b3aea6', roughness: 1 });
    const add = (geo, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      grp.add(m);
    };
    if (seated) {
      add(new THREE.CapsuleGeometry(17, 38, 6, 16), 0, 82, 0); // torso
      add(new THREE.SphereGeometry(11, 24, 16), 0, 128, 0);
      add(new THREE.BoxGeometry(34, 12, 44), 0, 52, 20); // thighs
      add(new THREE.BoxGeometry(34, 46, 12), 0, 23, 40); // lower legs
    } else {
      add(new THREE.CapsuleGeometry(17, 50, 6, 16), 0, 118, 0);
      add(new THREE.SphereGeometry(11, 24, 16), 0, 170, 0);
      add(new THREE.CapsuleGeometry(13, 62, 6, 12), 0, 44, 0);
    }
    grp.position.set(p.x_cm, 0, p.z_cm);
    return grp;
  }

  item(it) {
    const grp = new THREE.Group();
    const color = it.colors?.[0] || '#b9b2a7';
    const geo = it.shape === 'cylinder' ? new THREE.CylinderGeometry(0.5, 0.5, 1, 40)
      : it.shape === 'sphere' ? new THREE.SphereGeometry(0.5, 40, 24)
        : it.shape === 'cone' ? new THREE.ConeGeometry(0.5, 1, 40)
          : new THREE.BoxGeometry(1, 1, 1);
    const tex = this.textures.get(it.cut || it.thumb);
    const flat = it.shape === 'flat';
    const cutout = it.cut && tex && !flat;

    // The simple shape always casts the shadow. With a cut-out photo it is invisible.
    const solidMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    let mats = solidMat;
    if (cutout) {
      solidMat.colorWrite = false;
      solidMat.depthWrite = false;
    } else if (tex && (it.shape === 'box' || flat)) {
      mats = Array.from({ length: 6 }, () => solidMat);
      mats[flat ? 2 : 4] = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
    }
    const solid = new THREE.Mesh(geo, mats);
    solid.scale.set(it.w, it.h, it.d);
    solid.position.y = it.h / 2;
    solid.castShadow = true;
    solid.receiveShadow = !cutout;
    grp.add(solid);

    if (cutout) {
      const card = new THREE.Mesh(
        new THREE.PlaneGeometry(it.w, it.h),
        new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.35, roughness: 0.7, side: THREE.DoubleSide }),
      );
      card.position.y = it.h / 2;
      grp.add(card);
      this.billboards.push(card);
    }
    return grp;
  }

  /** Turns every photo cut-out to face the given camera (around the vertical axis only). */
  face(cam) {
    const world = new THREE.Vector3();
    for (const card of this.billboards) {
      card.getWorldPosition(world);
      card.rotation.y = Math.atan2(cam.position.x - world.x, cam.position.z - world.z) - card.parent.rotation.y;
    }
  }

  applyVisibility() {
    for (const s of this.labels) s.visible = s.userData.isLight ? this.showLabels && this.showLights : this.showLabels;
    for (const gz of this.gizmos) gz.visible = this.showLights;
  }

  frameAspect() {
    const [a, b] = (this.brief?.frame || '16:9').split(':').map(Number);
    return a / b;
  }

  /** Where the real camera would stand for the main photo. */
  mainCamera(aspect = this.frameAspect()) {
    const b = this.bounds;
    const k = this.k || 1;
    const size = b.getSize(new THREE.Vector3());
    const mid = b.getCenter(new THREE.Vector3());
    const v = THREE.MathUtils.degToRad(FOV) / 2;
    const hHalf = Math.atan(Math.tan(v) * aspect);
    // Landscape frames fit the full width; tall frames crop the sides and fit the height.
    // A tabletop set is small enough to keep whole, so it is never cropped.
    const fitW = ((size.x / 2) * (aspect >= 1 ? 1.22 : k < 1 ? 1.1 : 0.75)) / Math.tan(hHalf);
    const fitH = ((size.y / 2) * 1.45) / Math.tan(v);
    const dist = Math.max(fitW, fitH, 180 * k);
    const target = new THREE.Vector3(mid.x, Math.max(size.y * 0.5, 60 * k), mid.z);
    const view = this.brief?.camera || 'front';
    const pos = view === 'high' ? target.clone().add(new THREE.Vector3(0, dist * 0.45, dist * 0.9))
      : view === 'angle' ? target.clone().add(new THREE.Vector3(dist * 0.45, dist * 0.1, dist * 0.9))
        : target.clone().add(new THREE.Vector3(0, 18 * k, dist));
    return { pos, target };
  }

  /**
   * A camera position that looks at the middle of a box from a compass angle (az, degrees to the
   * right of straight on) and a height angle (el, degrees above level), just far enough back to fit it.
   */
  orbit(box, az, el, pad = 1.15) {
    const k = this.k || 1;
    const aspect = this.frameAspect();
    const v = THREE.MathUtils.degToRad(FOV) / 2;
    const hHalf = Math.atan(Math.tan(v) * aspect);
    const a = THREE.MathUtils.degToRad(az);
    const e = THREE.MathUtils.degToRad(el);
    const dir = new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
    const right = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
    const up = dir.clone().cross(right);
    const target = box.getCenter(new THREE.Vector3());
    const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    // A tall frame of a room set crops the sides, the same way the wide shot does.
    const crop = aspect < 1 && k === 1 ? 0.7 : 1;
    let dist = 40 * k;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const c = new THREE.Vector3(sx * half.x, sy * half.y, sz * half.z);
      const toward = c.dot(dir);
      dist = Math.max(dist, (Math.abs(c.dot(right)) * crop) / Math.tan(hHalf) + toward, Math.abs(c.dot(up)) / Math.tan(v) + toward);
    }
    const pos = target.clone().addScaledVector(dir, dist * pad);
    pos.y = Math.max(pos.y, 4 * k);
    return { pos, target };
  }

  /** Where to stand the real camera for a frame, in plain words. */
  describeCamera(pos, target) {
    const tt = (this.k || 1) < 1;
    const cm = (n) => `${Math.round(Math.abs(n))} cm`;
    const front = pos.z - this.D / 2;
    const tilt = Math.round(THREE.MathUtils.radToDeg(Math.asin((pos.y - target.y) / pos.distanceTo(target))));
    const side = Math.abs(pos.x) < 4 ? 'centred' : `${cm(pos.x)} ${pos.x < 0 ? 'left' : 'right'} of centre`;
    return [
      `Lens ${cm(pos.y)} above the ${tt ? 'table top' : 'floor'}`,
      front >= 0 ? `${cm(front)} in front of the ${tt ? "table's" : "set's"} front edge` : `over the ${tt ? 'table' : 'set'}, ${cm(front)} in from the front edge`,
      side,
      Math.abs(tilt) < 2 ? 'held level' : `tilted ${tilt > 0 ? 'down' : 'up'} ${Math.abs(tilt)}°`,
    ].join(' · ');
  }

  planShots(points, heroPos, personPos) {
    const k = this.k || 1;
    const b = this.bounds;
    const view = this.brief?.camera || 'front';
    const shots = [];
    const add = (name, note, cam) => shots.push({ name, note, ...cam, cam: this.describeCamera(cam.pos, cam.target) });
    add('Wide shot', 'The whole set from the camera position in your brief.', this.mainCamera());

    const prods = points.filter((p) => p.it.product);
    if (prods.length > 1) {
      const box = new THREE.Box3();
      for (const p of prods) {
        box.expandByPoint(p.centre.clone().add(new THREE.Vector3(-p.it.w / 2, -p.it.h / 2, 0)));
        box.expandByPoint(p.centre.clone().add(new THREE.Vector3(p.it.w / 2, p.it.h / 2, 0)));
      }
      add('Product group', 'All the featured products together, labels to the camera.', this.orbit(box, 0, 7, 1.4));
    }
    const focus = heroPos || points[0]?.centre;
    if (focus) {
      const hero = points.find((p) => p.centre === focus);
      const dist = Math.max((hero?.it.h || 20) * 3.4, 62 * k);
      add(heroPos ? 'Main product close-up' : 'Close-up', 'Moved in on the focal piece, slightly off to one side.', {
        pos: focus.clone().add(new THREE.Vector3(dist * 0.32, dist * 0.16, dist * 0.93)),
        target: focus.clone(),
      });
    }
    if (personPos) {
      add('Presenter framing', 'Chest-up on the person, props in the foreground.', {
        pos: personPos.clone().add(new THREE.Vector3(-45, 14, 250)), target: personPos.clone().add(new THREE.Vector3(0, 6, 0)),
      });
    }

    // The same set from each standard angle. The angle already used for the wide shot is skipped.
    if (view !== 'front') add('Straight on', 'Flat and graphic. Labels read cleanly.', this.orbit(b, 0, 4));
    add('Three-quarter left', 'From the left, to show depth between the layers.', this.orbit(b, -35, 12));
    if (view !== 'angle') add('Three-quarter right', 'From the right. Compare with the left to see which side hides less.', this.orbit(b, 35, 12));
    if (view !== 'high') add('High angle', 'Looking down about 35°. Shows the layout and the tops of the blocks.', this.orbit(b, 0, 35));
    add('Steep overhead', 'Close to a flat-lay. Standing labels get shorter from here, so use it for layout shots.', this.orbit(b, 0, 58));
    const low = this.orbit(b, 0, 0);
    low.pos.y = Math.max(5 * k, low.target.y * 0.3);
    add('Low angle', 'Lens near the surface, looking slightly up. Makes the products look tall.', low);
    this.shots = shots;
  }

  setView(view) {
    const W = this.W || 300;
    const D = this.D || 250;
    if (view === 'shot') {
      const { pos, target } = this.mainCamera(Math.max(this.camera.aspect, 0.5));
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
    } else {
      const k = this.k || 1;
      const target = new THREE.Vector3(0, view === 'top' ? 0 : 80 * k, -D * 0.1);
      const r = Math.max(W, D);
      const pos = { front: [0, 110 * k, r * 1.9], top: [0, r * 2.4, target.z + 1], side: [r * 1.5, 190 * k, r * 1.3] }[view] || [0, 110 * k, r * 1.9];
      this.camera.position.set(...pos);
      this.controls.target.copy(target);
    }
    this.controls.update();
  }

  /** Renders clean photo mockups (no labels or light markers) at the chosen frame shape. */
  renderShots(width = 1200) {
    const aspect = this.frameAspect();
    const w = aspect >= 1 ? width : Math.round(width * aspect);
    const h = Math.round(w / aspect);
    const cam = new THREE.PerspectiveCamera(FOV, aspect, 5, 9000);
    const ratio = this.renderer.getPixelRatio();
    this.busy = true;
    for (const s of this.labels) s.visible = false;
    for (const gz of this.gizmos) gz.visible = false;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    const out = [];
    try {
      for (const shot of this.shots) {
        cam.position.copy(shot.pos);
        cam.lookAt(shot.target);
        cam.updateMatrixWorld();
        this.face(cam);
        this.renderer.render(this.scene, cam);
        out.push({ name: shot.name, note: shot.note, cam: shot.cam, url: this.canvas.toDataURL('image/jpeg', 0.9), w, h });
      }
    } finally {
      this.renderer.setPixelRatio(ratio);
      this.applyVisibility();
      this.busy = false;
      this.resize();
    }
    return out;
  }
}
