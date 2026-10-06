'use strict';
// =====================================================================
//  DEAD SHIFT - small first-person warehouse shooter (three.js r128)
// =====================================================================
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// All hex colours below are authored in sRGB; convert to linear so lighting maths is physically sensible.
THREE.Color.prototype.setHex = (function (orig) { return function (h) { orig.call(this, h); return this.convertSRGBToLinear(); }; })(THREE.Color.prototype.setHex);

const MAP_W = 40, MAP_D = 32, MAP_H = 8;     // x: -20..20, z: -16..16
const TOTAL_MONSTERS = 6;

// ---------------------------------------------------------------- renderer
const USE_POST = !!(THREE.EffectComposer && THREE.UnrealBloomPass);
const renderer = new THREE.WebGLRenderer({ antialias: !USE_POST, powerPreference: 'high-performance' });
const PR = Math.min(window.devicePixelRatio, 2);
renderer.setPixelRatio(PR);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
if (!USE_POST) { renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1; }
document.body.insertBefore(renderer.domElement, document.body.firstChild);
const canvas = renderer.domElement;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);
scene.fog = new THREE.FogExp2(0x05060a, 0.045);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 100);
camera.rotation.order = 'YXZ';
scene.add(camera);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  if (composer) composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// ---------------------------------------------------------------- textures
function canvasTex(w, h, draw, rx, ry, linear) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx || 1, ry || 1);
  t.anisotropy = 8;
  if (!linear) t.encoding = THREE.sRGBEncoding;
  return t;
}
function speckle(g, w, h, n, alpha) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * alpha})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
}
const floorTex = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#55585a'; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 2500, .18);
  for (let i = 0; i < 14; i++) {            // stains
    const x = Math.random() * w, y = Math.random() * h, r = 10 + Math.random() * 40;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(20,15,10,.35)'); gr.addColorStop(1, 'rgba(20,15,10,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 2; g.strokeRect(0, 0, w, h);
}, 10, 8);
const wallTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#5d6469'; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 16) {
    const gr = g.createLinearGradient(x, 0, x + 16, 0);
    gr.addColorStop(0, 'rgba(255,255,255,.12)'); gr.addColorStop(.5, 'rgba(0,0,0,.18)'); gr.addColorStop(1, 'rgba(255,255,255,.12)');
    g.fillStyle = gr; g.fillRect(x, 0, 16, h);
  }
  speckle(g, w, h, 1500, .4);
  const rust = g.createLinearGradient(0, h * .6, 0, h);
  rust.addColorStop(0, 'rgba(90,40,15,0)'); rust.addColorStop(1, 'rgba(90,40,15,.45)');
  g.fillStyle = rust; g.fillRect(0, 0, w, h);
}, 8, 1);
const crateTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#7a5630'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 32) {
    g.fillStyle = `rgba(0,0,0,${.1 + Math.random() * .15})`; g.fillRect(0, y, w, 2);
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(40,20,0,.2)'; g.fillRect(Math.random() * w, y + Math.random() * 32, 20 + Math.random() * 40, 1); }
  }
  g.strokeStyle = '#3d2711'; g.lineWidth = 14; g.strokeRect(7, 7, w - 14, h - 14);
  g.lineWidth = 10; g.beginPath(); g.moveTo(10, 10); g.lineTo(w - 10, h - 10); g.stroke();
  speckle(g, w, h, 800, .4);
});
const cartonTex = canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = '#a98655'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(0, h / 2 - 2, w, 4);
  speckle(g, w, h, 100, .3);
});

const floorBump = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 5000; i++) { const v = 90 + Math.random() * 75 | 0; g.fillStyle = `rgba(${v},${v},${v},.5)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  g.strokeStyle = 'rgba(0,0,0,.7)'; g.lineWidth = 2;
  for (let i = 0; i < 18; i++) { g.beginPath(); let x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += rnd(-30, 30); y += rnd(-30, 30); g.lineTo(x, y); } g.stroke(); }
  g.strokeStyle = 'rgba(0,0,0,.9)'; g.lineWidth = 4; g.strokeRect(0, 0, w, h);
}, 10, 8, true);
const floorRough = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 4000; i++) { const v = 170 + Math.random() * 60 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
  for (let i = 0; i < 10; i++) {          // wet patches: low roughness, mirror-like highlights
    const x = Math.random() * w, y = Math.random() * h, r = 25 + Math.random() * 55;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(30,30,30,1)'); gr.addColorStop(.7, 'rgba(60,60,60,.8)'); gr.addColorStop(1, 'rgba(60,60,60,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}, 10, 8, true);
const wallBump = canvasTex(256, 256, (g, w, h) => {
  for (let x = 0; x < w; x += 16) {
    const gr = g.createLinearGradient(x, 0, x + 16, 0);
    gr.addColorStop(0, '#303030'); gr.addColorStop(.5, '#f0f0f0'); gr.addColorStop(1, '#303030');
    g.fillStyle = gr; g.fillRect(x, 0, 16, h);
  }
}, 8, 1, true);
const crateBump = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#909090'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 32) { g.fillStyle = '#202020'; g.fillRect(0, y, w, 3); for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(${Math.random() * 255 | 0},90,90,.25)`; g.fillRect(Math.random() * w, y + Math.random() * 32, 30 + Math.random() * 50, 1); } }
  g.strokeStyle = '#d0d0d0'; g.lineWidth = 14; g.strokeRect(7, 7, w - 14, h - 14);
  g.lineWidth = 10; g.beginPath(); g.moveTo(10, 10); g.lineTo(w - 10, h - 10); g.stroke();
}, 1, 1, true);
const M = {
  floor: new THREE.MeshStandardMaterial({ map: floorTex, bumpMap: floorBump, bumpScale: .5, roughnessMap: floorRough, roughness: 1, metalness: .15 }),
  wall: new THREE.MeshStandardMaterial({ map: wallTex, bumpMap: wallBump, bumpScale: 2.5, roughness: .7, metalness: .35, side: THREE.DoubleSide }),
  roof: new THREE.MeshStandardMaterial({ color: 0x1a1c1f, roughness: 1, side: THREE.DoubleSide }),
  crate: new THREE.MeshStandardMaterial({ map: crateTex, bumpMap: crateBump, bumpScale: .45, roughness: .9 }),
  carton: new THREE.MeshStandardMaterial({ map: cartonTex, roughness: .95 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x2b4a63, roughness: .6, metalness: .5 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x111214, roughness: .6, metalness: .6 }),
  beam: new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: .8, metalness: .4 }),
};

// ---------------------------------------------------------------- world
const world = [];        // meshes that block bullets
const colliders = [];    // {x0,x1,z0,z1}

function plane(w, h, mat, x, y, z, rx, ry) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, 0);
  m.receiveShadow = true;
  scene.add(m); world.push(m); return m;
}
plane(MAP_W, MAP_D, M.floor, 0, 0, 0, -Math.PI / 2);
plane(MAP_W, MAP_D, M.roof, 0, MAP_H, 0, Math.PI / 2);
plane(MAP_W, MAP_H, M.wall, 0, MAP_H / 2, -MAP_D / 2, 0, 0);
plane(MAP_W, MAP_H, M.wall, 0, MAP_H / 2, MAP_D / 2, 0, Math.PI);
plane(MAP_D, MAP_H, M.wall, -MAP_W / 2, MAP_H / 2, 0, 0, Math.PI / 2);
plane(MAP_D, MAP_H, M.wall, MAP_W / 2, MAP_H / 2, 0, 0, -Math.PI / 2);

function addCol(x0, x1, z0, z1, k) { colliders.push({ x0, x1, z0, z1, k }); }
function addBox(cx, cz, w, d, h, mat, y0, solid) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(cx, (y0 || 0) + h / 2, cz);
  m.castShadow = mat !== M.carton; m.receiveShadow = true;
  scene.add(m); world.push(m);
  if (solid !== false) colliders.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 });
  return m;
}
function addCrate(cx, cz, s, stack) {
  for (let i = 0; i < (stack || 1); i++) addBox(cx, cz, s, s, s, M.crate, i * s, i === 0);
  // register full-height collider once (first box did it)
}
function addBarrel(cx, cz, color) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, 1, 14),
    new THREE.MeshStandardMaterial({ color, roughness: .5, metalness: .6 }));
  m.position.set(cx, .5, cz); m.castShadow = m.receiveShadow = true; scene.add(m); world.push(m);
  colliders.push({ x0: cx - .35, x1: cx + .35, z0: cz - .35, z1: cz + .35 });
}
function addShelf(cx, cz, len) {
  const depth = 1.1, levels = [.15, 1.35, 2.55, 3.75];
  levels.forEach((y, li) => {
    addBox(cx, cz, len, depth, .08, M.metal, y, false);
    for (let x = -len / 2 + .6; x < len / 2 - .5; x += rnd(.9, 1.5)) {
      if (li === 3 || Math.random() < .25) continue;
      const s = rnd(.5, .9);
      addBox(cx + x, cz + rnd(-.1, .1), s, s * .9, rnd(.4, 1.0), M.carton, y + .04, false);
    }
  });
  for (let x = -len / 2; x <= len / 2 + .01; x += 2.4)
    for (const z of [-depth / 2 + .05, depth / 2 - .05]) addBox(cx + x, cz + z, .1, .1, 4.2, M.metal, 0, false);
  colliders.push({ x0: cx - len / 2, x1: cx + len / 2, z0: cz - depth / 2, z1: cz + depth / 2 });
}

// roof beams + hanging lamps
for (let z = -14; z <= 14; z += 4) { const b = new THREE.Mesh(new THREE.BoxGeometry(MAP_W, .35, .4), M.beam); b.position.set(0, MAP_H - .2, z); scene.add(b); }
for (let x = -16; x <= 16; x += 8) { const b = new THREE.Mesh(new THREE.BoxGeometry(.4, .3, MAP_D), M.beam); b.position.set(x, MAP_H - .5, 0); scene.add(b); }

// layout
addShelf(-11, -7, 12); addShelf(11, -7, 12);
addShelf(-11, 5, 12);  addShelf(10, 5, 10);
addCrate(-3, -2, 1.4); addCrate(3.5, 1, 1.4, 2); addCrate(-2, -10, 1.6, 2); addCrate(4, -12, 1.2);
addCrate(-17, 12, 1.5, 2); addCrate(-14, 13, 1.2); addCrate(17, 12, 1.5, 2); addCrate(-17, -12, 1.5, 2);
addCrate(-14, -1, 1.2); addCrate(15, -1.5, 1.2); addCrate(-5, 9, 1.3);
[[-7, 12], [-6.2, 12.4], [8, -10], [8.8, -10.4], [-18, 3], [18, 3], [0, -14.5]]
  .forEach(([x, z], i) => addBarrel(x, z, [0x8a1c14, 0x1c4a8a, 0x8a7a14][i % 3]));
addBox(-16, -14, 2, 1.2, 1.0, M.crate, 0, true);   // crossbow table (far west corner)

// ---- second floor (mezzanine) + stairs
const PLAT_Y = 4, PLAT_Z0 = 10;
const platform = new THREE.Mesh(new THREE.BoxGeometry(MAP_W, .3, 16 - PLAT_Z0), M.metal);
platform.castShadow = platform.receiveShadow = true;
platform.position.set(0, PLAT_Y - .15, (16 + PLAT_Z0) / 2); scene.add(platform); world.push(platform);
[-18, -9, 0, 9, 15].forEach(x => { addBox(x, PLAT_Z0 + .25, .5, .5, PLAT_Y - .3, M.dark, 0, true); });
// stairs (x 16..19.7, z 2..10, rising toward +z)
for (let i = 0; i < 8; i++) {
  const h = .5 * (i + 1);
  const st = new THREE.Mesh(new THREE.BoxGeometry(3.7, h, 1), M.metal);
  st.castShadow = st.receiveShadow = true; st.position.set(17.85, h / 2, 2 + i + .5); scene.add(st); world.push(st);
}
addCol(16.0, 16.15, 2, 10, 7);      // stair side wall (blocks everyone)
addCol(16, 19.7, 2, 10, 4);         // stair body (monsters can't walk through it)
addCol(16, 19.7, 9.9, 10.1, 5);     // blocks ground-floor walkers from sneaking up under the platform edge
addCol(-20, 15.95, 9.85, 10.15, 2); // 2nd floor railing
// railing visuals
const railMat = new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: .4, metalness: .8 });
for (const y of [PLAT_Y + .55, PLAT_Y + 1.05]) { const r = new THREE.Mesh(new THREE.BoxGeometry(36, .05, .05), railMat); r.position.set(-2, y, PLAT_Z0 + .05); scene.add(r); }
for (let x = -20; x <= 15.9; x += 2) { const p = new THREE.Mesh(new THREE.BoxGeometry(.06, 1.05, .06), railMat); p.position.set(x, PLAT_Y + .52, PLAT_Z0 + .05); scene.add(p); }
{ const r = new THREE.Mesh(new THREE.BoxGeometry(.05, .05, 9), railMat); r.position.set(16.05, 2 + 1.05, 6); r.rotation.x = -Math.atan(4 / 8); scene.add(r); }
const under = new THREE.PointLight(0xffd9a0, .7, 12, 1.5); under.position.set(0, 3.2, 13); scene.add(under);

// decorative: roll-up door + exit sign
const door = new THREE.Mesh(new THREE.PlaneGeometry(8, 6), new THREE.MeshStandardMaterial({ color: 0x3c4146, roughness: .6, metalness: .5 }));
door.position.set(-6, 3, -MAP_D / 2 + .05); scene.add(door);
for (let y = .4; y < 6; y += .4) { const l = new THREE.Mesh(new THREE.BoxGeometry(8, .03, .05), M.dark); l.position.set(-6, y, -MAP_D / 2 + .08); scene.add(l); }
const exitSign = new THREE.Mesh(new THREE.BoxGeometry(1.2, .4, .1), new THREE.MeshBasicMaterial({ color: 0x22ff66 }));
exitSign.position.set(8, 4, -MAP_D / 2 + .1); scene.add(exitSign);

// ---------------------------------------------------------------- lights
scene.add(new THREE.AmbientLight(0x3a4658, 0.75));
scene.add(new THREE.HemisphereLight(0x405070, 0x201010, 0.35));
const lamps = [];
[[-10, -8], [10, -8], [-10, 8], [10, 8], [0, 0], [0, -12]].forEach(([x, z], i) => {
  const l = new THREE.PointLight(0xffd9a0, 1.0, 20, 1.4);
  l.position.set(x, 6.3, z); scene.add(l);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(.5, .35, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0x222, side: THREE.DoubleSide }));
  shade.position.set(x, 6.55, z); scene.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(.12, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffe8b0 }));
  bulb.position.set(x, 6.35, z); scene.add(bulb);
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, 1.2, 4), M.dark);
  chain.position.set(x, 7.4, z); scene.add(chain);
  const broken = i === 1 || i === 3;
  let sp = null;
  if (!broken) {
    sp = new THREE.SpotLight(0xffd9a0, 2.2, 26, 1.1, .7, 1.1);
    sp.position.set(x, 6.3, z); sp.target.position.set(x, 0, z); scene.add(sp); scene.add(sp.target);
    sp.castShadow = true; sp.shadow.mapSize.set(1024, 1024); sp.shadow.bias = -.0005; sp.shadow.camera.near = .6; sp.shadow.camera.far = 24;
  }
  // faint volumetric light cone
  const cg = new THREE.ConeGeometry(4.6, 6.2, 28, 1, true), col = [];
  for (let v = 0; v < cg.attributes.position.count; v++) { const k = cg.attributes.position.getY(v) > 0 ? 1 : 0; col.push(k, k * .9, k * .7); }
  cg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const cone = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: broken ? .025 : .05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  cone.position.set(x, 3.2, z); scene.add(cone);
  lamps.push({ l, bulb, sp, cone, coneBase: cone.material.opacity, base: .7, broken, t: rnd(0, 10) });
});
[[-19, -15], [19, -15], [-19, 15], [19, 15]].forEach(([x, z]) => {
  const l = new THREE.PointLight(0xff2200, 0.7, 13, 1.5); l.position.set(x, 5, z); scene.add(l);
  const b = new THREE.Mesh(new THREE.SphereGeometry(.15, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff3311 }));
  b.position.copy(l.position); scene.add(b);
});
const flash = new THREE.PointLight(0xffaa55, 0, 14, 1.5);
camera.add(flash);
const torch = new THREE.SpotLight(0xfff2d0, 1.4, 28, 0.5, 0.55, 1.2);
torch.position.set(.2, -.1, 0); torch.target.position.set(0, 0, -5);
torch.castShadow = true; torch.shadow.mapSize.set(1024, 1024); torch.shadow.bias = -.0004; torch.shadow.camera.near = .25; torch.shadow.camera.far = 30;
camera.add(torch); camera.add(torch.target);

let flickerBurst = 0;
function updateLamps(dt, tNow) {
  flickerBurst = Math.max(0, flickerBurst - dt);
  lamps.forEach(o => {
    o.t += dt;
    let k = 1;
    if (o.broken) k = Math.random() < .08 ? rnd(.05, .4) : (Math.sin(o.t * 3) > .94 ? .25 : 1);
    if (flickerBurst > 0) k = Math.random() < .55 ? rnd(0, .25) : 1;
    o.l.intensity = o.base * k; if (o.sp) o.sp.intensity = 2.2 * k; o.cone.material.opacity = o.coneBase * (.3 + .7 * k);
    o.bulb.material.color.setScalar(.3 + .7 * k);
  });
}

// ---------------------------------------------------------------- dust motes
const DUST = 450, dustPos = new Float32Array(DUST * 3);
for (let i = 0; i < DUST; i++) { dustPos[i * 3] = rnd(-19, 19); dustPos[i * 3 + 1] = rnd(.3, 7.5); dustPos[i * 3 + 2] = rnd(-15, 15); }
const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xffe6c8, size: .022, transparent: true, opacity: .5, depthWrite: false, blending: THREE.AdditiveBlending }));
dust.frustumCulled = false; scene.add(dust);
function updateDust(dt) {
  for (let i = 0; i < DUST; i++) {
    dustPos[i * 3] += Math.sin(time * .3 + i) * .05 * dt;
    dustPos[i * 3 + 1] -= .04 * dt;
    dustPos[i * 3 + 2] += Math.cos(time * .25 + i * 1.7) * .05 * dt;
    if (dustPos[i * 3 + 1] < .2) dustPos[i * 3 + 1] = 7.5;
  }
  dustGeo.attributes.position.needsUpdate = true;
}

// ---------------------------------------------------------------- post-processing (bloom, ACES tone-map, grade, grain)
let composer = null, bloom = null, grade = null, fearLevel = 0;
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, fear: { value: 0 }, hurt: { value: 0 }, res: { value: new THREE.Vector2(innerWidth, innerHeight) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, fear, hurt; uniform vec2 res; varying vec2 vUv;
    vec3 aces(vec3 x){ const float a=2.51,b=.03,c=2.43,d=.59,e=.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.,1.); }
    void main(){
      vec2 d = vUv - .5; float r = dot(d,d);
      vec2 off = d * r * (.016 + fear*.035 + hurt*.05);
      vec3 col = vec3(texture2D(tDiffuse, vUv+off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv-off).b);
      col *= 1.25;
      col = aces(col);
      float l = dot(col, vec3(.299,.587,.114));
      col = mix(vec3(l), col, .78);                       // slightly desaturated
      col *= mix(vec3(1.04,1.0,.94), vec3(.92,1.0,1.08), smoothstep(.0,.6,1.-l)); // warm highlights, cold shadows
      col *= 1. - smoothstep(.25,.75,r*2.6) * .65;         // vignette
      col = pow(col, vec3(1./2.2));
      float n = fract(sin(dot(vUv*res + fract(time)*100., vec2(12.9898,78.233))) * 43758.5453);
      col += (n-.5) * .07;                                // film grain
      gl_FragColor = vec4(col, 1.);
    }`
};
if (USE_POST) {
  const rt = new THREE.WebGLMultisampleRenderTarget(innerWidth * PR, innerHeight * PR, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  rt.samples = 4;
  composer = new THREE.EffectComposer(renderer, rt);
  composer.setPixelRatio(PR); composer.setSize(innerWidth, innerHeight);
  composer.addPass(new THREE.RenderPass(scene, camera));
  bloom = new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .7, .65, .8);
  composer.addPass(bloom);
  grade = new THREE.ShaderPass(GradeShader);
  composer.addPass(grade);
}

// ---------------------------------------------------------------- audio (synthesised)
let AC, master, noiseBuf;
function initAudio() {
  if (AC) return;
  AC = new (window.AudioContext || window.webkitAudioContext)();
  master = AC.createGain(); master.gain.value = .75; master.connect(AC.destination);
  noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // drone
  [48, 50.3].forEach(f => {
    const o = AC.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const fl = AC.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 130;
    const g = AC.createGain(); g.gain.value = .05;
    o.connect(fl); fl.connect(g); g.connect(master); o.start();
  });
  setInterval(() => { if (state === 'play') tone(rnd(250, 450), rnd(90, 160), rnd(.6, 1.2), .03, 'sawtooth'); }, 6500);
}
function noise(dur, f0, f1, vol, type, delay) {
  if (!AC) return;
  const t = AC.currentTime + (delay || 0);
  const s = AC.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const fl = AC.createBiquadFilter(); fl.type = type || 'lowpass';
  fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = AC.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(master); s.start(t); s.stop(t + dur + .05);
}
function tone(f0, f1, dur, vol, type, delay) {
  if (!AC) return;
  const t = AC.currentTime + (delay || 0);
  const o = AC.createOscillator(); o.type = type || 'sine';
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = AC.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .05);
}
const SFX = {
  shotgun() { noise(.45, 2500, 150, 1.0); tone(110, 35, .35, .9); noise(.08, 6000, 3000, .4, 'highpass'); SFX.pump(.45); },
  pump(d) { noise(.05, 3000, 1500, .35, 'bandpass', d); noise(.05, 2500, 1200, .35, 'bandpass', d + .14); },
  shell() { noise(.05, 2800, 1400, .3, 'bandpass'); tone(900, 500, .05, .1, 'square'); },
  empty() { noise(.04, 4000, 2000, .3, 'highpass'); },
  crossbow() { tone(420, 90, .18, .35, 'sawtooth'); noise(.1, 6000, 2000, .35, 'highpass'); tone(180, 60, .1, .4); },
  cbLoad() { noise(.06, 2000, 900, .25, 'bandpass'); tone(200, 320, .12, .1, 'triangle'); },
  groan(dist) { const v = clamp(1 - dist / 28, .04, 1) * .35; const f = rnd(70, 120); tone(f, f * .5, 1.1, v, 'sawtooth'); tone(f * 1.5, f * .7, .9, v * .4, 'square'); noise(.8, 500, 150, v * .6, 'lowpass'); },
  screech(dist) { playScream(dist, 1); },
  heart(f) { tone(70, 38, .16, .25 + f * .5); tone(60, 34, .16, .18 + f * .4, 'sine', .17); },
  hurt() { tone(220, 70, .25, .35, 'square'); noise(.2, 800, 200, .4); },
  hitEnemy() { noise(.08, 900, 300, .35); },
  die(dist) { const v = clamp(1 - dist / 25, .1, 1) * .5; tone(140, 35, 1.1, v, 'sawtooth'); noise(.6, 700, 100, v); },
  pickup() { [523, 659, 784].forEach((f, i) => tone(f, f, .18, .2, 'sine', i * .08)); },
  swing() { noise(.18, 1200, 300, .2, 'bandpass'); },
};

// ---------------------------------------------------------------- music (looping soundtrack)
const music = new Audio('music.mp3');
music.loop = true; music.volume = .5;
const screamBase = new Audio('scream.mp3'); screamBase.preload = 'auto';
let lastScream = -99, screamNow = null;
// one scream at a time; spotting/chasing screams need a 5 s gap, a scream when hit (force) only needs the previous one to finish
function playScream(dist, loud, force) {
  if (screamNow && !screamNow.ended && !screamNow.paused) return;
  if (!force && time - lastScream < 5) return;
  lastScream = time;
  const a = screamBase.cloneNode(true);
  a.volume = clamp((1 - dist / 35) * loud, .1, 1);
  a.playbackRate = rnd(.92, 1.08);
  screamNow = a;
  const p = a.play(); if (p && p.catch) p.catch(() => {});
}
// title-screen music: starts as soon as the browser allows it (Chrome may need a first click/key), stops when the game starts
const titleMusic = new Audio('starting.mp3');
titleMusic.loop = true; titleMusic.volume = .6;
let titleMusicOn = true;
function tryTitleMusic() {
  if (!titleMusicOn) return;
  const p = titleMusic.play();
  if (p && p.catch) p.catch(() => {
    const retry = () => { removeEventListener('pointerdown', retry); removeEventListener('keydown', retry); tryTitleMusic(); };
    addEventListener('pointerdown', retry); addEventListener('keydown', retry);
  });
}
function stopTitleMusic() {
  titleMusicOn = false;
  const fade = setInterval(() => {
    titleMusic.volume = Math.max(0, titleMusic.volume - .1);
    if (titleMusic.volume <= 0) { titleMusic.pause(); clearInterval(fade); }
  }, 60);
}
tryTitleMusic();
function playMusic() { const p = music.play(); if (p && p.catch) p.catch(() => {}); }

// ---------------------------------------------------------------- state
let state = 'menu';       // menu | play | paused | dead | win
const keys = {};
let mouseDown = false;
const player = { pos: V3(0, 1.7 + PLAT_Y, 13), yaw: 0, pitch: -.3, hp: 100, bob: 0, moving: 0, shake: 0, up: true, floorY: PLAT_Y };
let kills = 0;
let time = 0;

// ---------------------------------------------------------------- viewmodels
const skin = new THREE.MeshStandardMaterial({ color: 0xc89a7a, roughness: .8 });
const sleeve = new THREE.MeshStandardMaterial({ color: 0x2d3a2a, roughness: .9 });
const wood = new THREE.MeshStandardMaterial({ color: 0x5a3820, roughness: .7 });
const steel = new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: .35, metalness: .85 });
function bx(w, h, d, mat, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m;
}
function cyl(r, len, mat, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat);
  m.rotation.x = Math.PI / 2; m.position.set(x, y, z); parent.add(m); return m;
}

function buildShotgun() {
  const g = new THREE.Group();
  cyl(.018, .75, steel, 0, .03, -.32, g);
  cyl(.016, .55, steel, 0, -.015, -.25, g);
  bx(.075, .1, .24, steel, 0, 0, .02, g);
  const pump = bx(.065, .055, .2, wood, 0, -.035, -.28, g);
  bx(.05, .1, .34, wood, 0, -.06, .26, g).rotation.x = -.12;
  bx(.07, .07, .09, skin, 0, -.07, -.28, g);               // left hand
  bx(.06, .07, .09, skin, 0, -.09, .08, g);                // right hand
  bx(.09, .09, .5, sleeve, -.05, -.14, -.05 + .3, g).rotation.y = .1;
  bx(.09, .09, .45, sleeve, .06, -.17, .4, g).rotation.y = -.15;
  const f = new THREE.Sprite(new THREE.SpriteMaterial({
    map: canvasTex(64, 64, (c, w, h) => {
      const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,220,1)'); gr.addColorStop(.3, 'rgba(255,170,60,.9)'); gr.addColorStop(1, 'rgba(255,80,0,0)');
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
    }), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false
  }));
  f.scale.set(.5, .5, .5); f.position.set(0, .03, -.8); f.visible = false; g.add(f);
  g.userData.flash = f; g.userData.pump = pump;
  return g;
}
function buildCrossbow() {
  const g = new THREE.Group();
  bx(.05, .06, .55, wood, 0, -.04, .05, g);
  bx(.032, .03, .5, steel, 0, .0, -.15, g);
  bx(.09, .045, .07, steel, 0, 0, -.4, g);
  const l = bx(.32, .02, .035, steel, -.17, 0, -.36, g); l.rotation.y = .38;
  const r = bx(.32, .02, .035, steel, .17, 0, -.36, g); r.rotation.y = -.38;
  bx(.58, .004, .004, new THREE.MeshBasicMaterial({ color: 0xddd6c0 }), 0, .008, -.28, g);
  const bolt = new THREE.Group();
  cyl(.007, .45, new THREE.MeshStandardMaterial({ color: 0x777 }), 0, 0, 0, bolt);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(.014, .06, 8), steel); tip.rotation.x = -Math.PI / 2; tip.position.z = -.25; bolt.add(tip);
  bolt.position.set(0, .03, -.22); g.add(bolt);
  bx(.07, .07, .09, skin, 0, -.08, -.12, g);
  bx(.06, .07, .09, skin, 0, -.09, .22, g);
  bx(.09, .09, .5, sleeve, -.02, -.14, -.0 + .08, g).rotation.y = .1;
  bx(.09, .09, .5, sleeve, .06, -.17, .55, g).rotation.y = -.15;
  g.userData.bolt = bolt;
  return g;
}
const vm = new THREE.Group();
camera.add(vm);
const sgVM = buildShotgun(), cbVM = buildCrossbow();
vm.add(sgVM); vm.add(cbVM); cbVM.visible = false;
// make viewmodel render on top of walls
[sgVM, cbVM].forEach(g => g.traverse(o => { if (o.isMesh) o.renderOrder = 10; }));
vm.position.set(.24, -.24, -.5);
vm.scale.setScalar(.85);

// ---------------------------------------------------------------- weapons
const WP = {
  current: 'shotgun', hasCross: false, pending: null, switchT: 0,
  sg: { ammo: 6, cap: 6, reserve: 10, cd: 0, reloading: false, rt: 0 },
  cb: { cd: 0, boltT: 0 },
  recoil: 0, flashT: 0,
};
function setWeapon(name) {
  if (name === WP.current || WP.switchT > 0) return;
  if (name === 'crossbow' && !WP.hasCross) return;
  WP.pending = name; WP.switchT = .5; WP.sg.reloading = false; SFX.swing();
}
function startReload() {
  const s = WP.sg;
  if (WP.current !== 'shotgun' || s.reloading || s.ammo >= s.cap || s.reserve <= 0) return;
  s.reloading = true; s.rt = .5;
}

// ---------------------------------------------------------------- particles / effects
const pGeo = new THREE.BoxGeometry(.045, .045, .045);
const pBlood = new THREE.MeshBasicMaterial({ color: 0x8a0b0b });
const pSpark = new THREE.MeshBasicMaterial({ color: 0xffd27a });
const particles = [], tracers = [];
function burst(p, mat, n, speed) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(pGeo, mat); m.position.copy(p); scene.add(m);
    particles.push({ m, v: V3(rnd(-1, 1) * speed, rnd(.2, 1.2) * speed, rnd(-1, 1) * speed), life: rnd(.35, .8) });
  }
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.life -= dt; p.v.y -= 12 * dt;
    p.m.position.addScaledVector(p.v, dt);
    if (p.m.position.y < .03) { p.m.position.y = .03; p.v.set(0, 0, 0); }
    if (p.life <= 0) { scene.remove(p.m); particles.splice(i, 1); }
  }
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i]; t.life -= dt; t.line.material.opacity = Math.max(0, t.life / .18);
    if (t.life <= 0) { scene.remove(t.line); t.line.geometry.dispose(); tracers.splice(i, 1); }
  }
}
function addTracer(a, b) {
  const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 1 }));
  scene.add(line); tracers.push({ line, life: .18 });
}
const poolMat = new THREE.MeshBasicMaterial({ color: 0x3a0505, transparent: true, opacity: .85, polygonOffset: true, polygonOffsetFactor: -2 });
function bloodPool(x, z) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(rnd(.7, 1.1), 16), poolMat);
  m.rotation.x = -Math.PI / 2; m.position.set(x, .015, z); scene.add(m);
}

// ---------------------------------------------------------------- collision
// mask bits: 1 = player on ground floor, 2 = player on 2nd floor, 4 = monsters (default collider = 5)
function collide(pos, r, mode) {
  mode = mode || 4;
  pos.x = clamp(pos.x, -MAP_W / 2 + r, MAP_W / 2 - r);
  pos.z = clamp(pos.z, -MAP_D / 2 + r, MAP_D / 2 - r);
  for (const b of colliders) {
    if (!((b.k === undefined ? 5 : b.k) & mode)) continue;
    const cx = clamp(pos.x, b.x0, b.x1), cz = clamp(pos.z, b.z0, b.z1);
    const dx = pos.x - cx, dz = pos.z - cz, d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-8) { const d = Math.sqrt(d2), p = r - d; pos.x += dx / d * p; pos.z += dz / d * p; }
      else {
        const l = pos.x - b.x0, rr = b.x1 - pos.x, t = pos.z - b.z0, bt = b.z1 - pos.z, m = Math.min(l, rr, t, bt);
        if (m === l) pos.x = b.x0 - r; else if (m === rr) pos.x = b.x1 + r; else if (m === t) pos.z = b.z0 - r; else pos.z = b.z1 + r;
      }
    }
  }
}

// ---------------------------------------------------------------- story: pain points and how the Semantic Bot fixes them
// (edit this table to change the wording shown in the game)
const PAIN = {
  'Platform Team':  { pain: 'Needs a model built by the Platform Team: wait in the queue', fix: 'No ticket needed. Semantic Bot builds the model' },
  'dbt Aggregate':  { pain: 'dbt aggregate models written by hand', fix: 'Aggregates generated automatically' },
  'Semantic Layer': { pain: 'Semantic layer authored by hand', fix: 'Semantic layer generated, never hand-written' },
  'Testing':        { pain: 'Alerting and tests added manually', fix: 'Tests and alerts come built in' },
  'Dashboard':      { pain: 'Every dashboard re-implements its own logic: two teams, two definitions of revenue', fix: 'One source of truth: every team sees the same revenue' },
  'Maintenance':    { pain: 'The analyst is responsible for maintaining everything', fix: 'Semantic Bot maintains it, not the analyst' },
};
const stats = { sg: { kills: 0, time: 0, shots: 0 }, cb: { kills: 0, time: 0, shots: 0 } };
let lastPain = -99;
function painMsg(m) {
  const p = PAIN[m.name]; if (!p) return;
  showMsg(`<span style="color:#ff7a6a">${m.name.toUpperCase()}</span><br><span style="font-size:16px;color:#ddd">${p.pain}</span>`, 4.5);
}
function statsHTML() {
  const f = o => o.kills ? `${(o.time / o.kills).toFixed(1)} s and ${(o.shots / o.kills).toFixed(1)} shots per monster (${o.kills} killed)` : 'none killed';
  return `<div style="font-size:17px;line-height:2">
    <span style="color:#e8d9a8">WITHOUT SEMANTIC BOT (shotgun):</span> ${f(stats.sg)}<br>
    <span style="color:#8cf">WITH SEMANTIC BOT (crossbow):</span> ${f(stats.cb)}</div>`;
}
function legendHTML() {
  return '<div style="font-size:14px;line-height:1.7;max-width:760px">' + Object.keys(PAIN).map(n =>
    `<span style="color:#ff7a6a">${n}</span>: ${PAIN[n].pain}<br><span style="color:#8cf;margin-left:18px">&rarr; ${PAIN[n].fix}</span>`).join('<br>') + '</div>';
}

// ---------------------------------------------------------------- monsters
const monsters = [];
function nameSprite(text, color, onTop) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(0, 0, 512, 96);
  g.strokeStyle = color; g.lineWidth = 4; g.strokeRect(2, 2, 508, 92);
  g.fillStyle = color; g.font = 'bold 46px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 50);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: (() => { const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t; })(), transparent: true, fog: false, depthTest: !onTop }));
  if (onTop) sp.renderOrder = 20;
  sp.scale.set(2.2, .41, 1);
  return sp;
}
function skinTex(c) {
  const col = '#' + c.toString(16).padStart(6, '0');
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = col; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 1500, .5);
    for (let i = 0; i < 16; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 8 + Math.random() * 22;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, Math.random() < .5 ? 'rgba(60,20,50,.5)' : 'rgba(20,30,10,.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.strokeStyle = 'rgba(50,20,90,.6)';
    for (let i = 0; i < 12; i++) {                       // veins
      g.lineWidth = 1 + Math.random() * 1.5; g.beginPath();
      let x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += rnd(-18, 18); y += rnd(-18, 18); g.lineTo(x, y); }
      g.stroke();
    }
    for (let i = 0; i < 7; i++) {                        // open sores
      const x = Math.random() * w, y = Math.random() * h, r = 3 + Math.random() * 7;
      g.fillStyle = 'rgba(120,10,10,.85)'; g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill();
      g.fillStyle = 'rgba(40,0,0,.9)'; g.beginPath(); g.arc(x, y, r * .5, 0, 6.3); g.fill();
    }
  });
}
const skinBump = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2500; i++) { const v = Math.random() * 255 | 0; g.fillStyle = `rgba(${v},${v},${v},.6)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  g.strokeStyle = '#e0e0e0'; g.lineWidth = 2;
  for (let i = 0; i < 12; i++) { g.beginPath(); let x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += rnd(-16, 16); y += rnd(-16, 16); g.lineTo(x, y); } g.stroke(); }
}, 1, 1, true);
const skinTexes = [0x7a8a68, 0x8a7a6a, 0x6a7a7a].map(skinTex);
const glowTex = canvasTex(64, 64, (c, w, h) => {
  const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,230,120,1)'); gr.addColorStop(.25, 'rgba(255,140,20,.8)'); gr.addColorStop(1, 'rgba(255,60,0,0)');
  c.fillStyle = gr; c.fillRect(0, 0, w, h);
});
const gibGeo = new THREE.BoxGeometry(.13, .1, .1);
const gibMat = new THREE.MeshStandardMaterial({ color: 0x7a1a1a, roughness: .4 });
function gibs(p, n) {
  for (let i = 0; i < n; i++) {
    const me = new THREE.Mesh(gibGeo, gibMat); me.position.copy(p); me.scale.setScalar(rnd(.5, 1.4)); scene.add(me);
    particles.push({ m: me, v: V3(rnd(-1, 1) * 4, rnd(.5, 1.5) * 4, rnd(-1, 1) * 4), life: rnd(1.5, 3.5) });
  }
}

function makeMonster(x, z, dormant, name) {
  const m = {
    name, hp: 100, state: dormant ? 'dormant' : 'wander', t: 0, pause: rnd(0, 2), lose: 0, wp: null, speed: rnd(2.9, 3.4),
    atk: rnd(.3, 1), windup: 0, stun: 0, stuck: 0, sideT: 0, sideDir: 1,
    flash: 0, phase: rnd(0, 6), groanT: rnd(2, 5), wakeIn: null, meshes: [], mats: [], fromRot: 0,
  };
  const g = new THREE.Group(); g.rotation.order = 'YXZ'; m.g = g;
  const tex = skinTexes[Math.floor(Math.random() * skinTexes.length)];
  const std = (o) => { const mt = new THREE.MeshStandardMaterial(o); m.mats.push(mt); return mt; };
  const skinM = std({ map: tex, bumpMap: skinBump, bumpScale: .4, roughness: .55 }), darkM = std({ map: tex, bumpMap: skinBump, bumpScale: .4, color: 0xaa9999, roughness: .65 });
  const clothM = std({ color: [0x2a2226, 0x3a2424, 0x232d36][Math.floor(Math.random() * 3)], roughness: 1 });
  const pantsM = std({ color: 0x1c1e22, roughness: 1 });
  const fleshM = std({ color: 0x7a1a1a, roughness: .25, emissive: 0x180000 });
  const boneM = std({ color: 0xd8d0b8, roughness: .6 });
  const eyeM = new THREE.MeshBasicMaterial({ color: 0xffb020, fog: false });
  const add = (w, h, d, mat, px, py, pz, parent, head) => {
    const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    me.position.set(px, py, pz); parent.add(me); me.castShadow = me.receiveShadow = true;
    me.userData.mon = m; if (head) me.userData.head = true; m.meshes.push(me); return me;
  };
  const pivot = (px, py, pz, parent) => { const p = new THREE.Group(); p.position.set(px, py, pz); parent.add(p); return p; };

  // legs (bent knees)
  [-1, 1].forEach(sd => {
    const hip = pivot(sd * .17, .95, 0, g), knee = pivot(0, -.5, 0, hip);
    add(.21, .5, .23, pantsM, 0, -.25, 0, hip);
    knee.rotation.x = .55;
    add(.17, .5, .18, skinM, 0, -.25, 0, knee);
    add(.18, .08, .3, darkM, 0, -.52, .07, knee);
    if (sd < 0) { m.legL = hip; m.kneeL = knee; } else { m.legR = hip; m.kneeR = knee; }
  });
  // hunched torso
  const torso = m.torso = pivot(0, .95, 0, g); torso.rotation.x = .35;
  add(.6, .45, .34, clothM, 0, .25, 0, torso);                 // torn shirt (lower)
  add(.62, .4, .34, darkM, 0, .66, 0, torso);                  // chest
  add(.36, .4, .06, fleshM, 0, .62, .17, torso);               // open chest cavity
  for (let k = 0; k < 4; k++) {                                // exposed ribs
    const y = .5 + k * .1;
    add(.5, .035, .05, boneM, 0, y, .2, torso);
    const rl = add(.12, .035, .05, boneM, -.27, y - .02, .17, torso); rl.rotation.z = .5;
    const rr = add(.12, .035, .05, boneM, .27, y - .02, .17, torso); rr.rotation.z = -.5;
  }
  for (let k = 0; k < 5; k++) add(.07, .07, .07, boneM, 0, .15 + k * .17, -.2, torso);   // spine bumps
  for (let k = 0; k < 3; k++) {                                // tumours
    const t = new THREE.Mesh(new THREE.SphereGeometry(rnd(.1, .19), 6, 5), fleshM);
    t.position.set(rnd(-.25, .25), rnd(.3, .85), -.2); torso.add(t); t.castShadow = true; t.userData.mon = m; m.meshes.push(t);
  }
  // head
  const head = m.head = pivot(0, .98, .08, torso); head.rotation.x = -.3;
  add(.36, .38, .4, skinM, 0, .14, .04, head, true);
  add(.38, .07, .12, darkM, 0, .27, .2, head, true);           // heavy brow
  add(.2, .12, .2, fleshM, .09, .37, -.04, head, true);        // exposed brain
  add(.3, .04, .05, boneM, 0, -.03, .25, head, true);          // upper teeth
  [-1, 1].forEach(sd => {
    add(.075, .05, .04, eyeM, sd * .1, .2, .25, head, true);
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    gl.scale.set(.34, .34, 1); gl.position.set(sd * .1, .2, .28); head.add(gl);
  });
  const jaw = m.jaw = pivot(0, -.05, 0, head); jaw.rotation.x = .3;
  add(.28, .1, .34, darkM, 0, -.05, .16, jaw, true);
  add(.24, .04, .04, boneM, 0, .01, .31, jaw, true);           // lower teeth
  add(.12, .05, .2, fleshM, 0, -.0, .16, jaw, true);           // tongue
  // arms: long, clawed
  [-1, 1].forEach(sd => {
    const sh = pivot(sd * .44, .8, 0, torso), el = pivot(0, -.46, 0, sh);
    add(.22, .18, .24, darkM, 0, .02, 0, sh);
    add(.15, .48, .15, skinM, 0, -.22, 0, sh);
    el.rotation.x = -.5;
    add(.13, .5, .13, darkM, 0, -.25, 0, el);
    add(.13, .1, .11, darkM, 0, -.53, 0, el);
    for (let c = -1; c <= 1; c++) add(.022, .2, .022, boneM, c * .04, -.68, .02, el);
    if (sd < 0) m.armL = sh; else m.armR = sh;
  });
  if (Math.random() < .5) m.armR.scale.set(1.45, 1.25, 1.45);   // mutated arm
  const s = rnd(1.05, 1.22); g.scale.setScalar(s);
  g.position.set(x, dormant ? .18 : 0, z);
  if (dormant) g.rotation.x = -Math.PI / 2;
  g.rotation.y = rnd(0, 6.28);
  m.label = nameSprite(name.toUpperCase(), '#ff5a4a'); m.label.position.set(0, 2.55, 0); g.add(m.label);
  scene.add(g); monsters.push(m);
  return m;
}
function animExtra(m, dt, chase) {
  const k = Math.min(1, dt * 6);
  m.torso.rotation.x += ((chase ? .6 : .32) - m.torso.rotation.x) * k;
  const open = m.windup > 0 ? 1 : chase ? .4 + Math.abs(Math.sin(time * 16 + m.phase)) * .25 : .25 + Math.sin(time * 2 + m.phase) * .06;
  m.jaw.rotation.x += (open - m.jaw.rotation.x) * Math.min(1, dt * 20);
  m.head.rotation.z = Math.sin(time * (chase ? 25 : 3) + m.phase) * (chase ? .12 : .09);
  if (chase && Math.random() < .08) m.head.rotation.y = rnd(-.4, .4); else m.head.rotation.y *= 1 - Math.min(1, dt * 8);
  const sw = Math.sin(m.phase);
  m.kneeL.rotation.x = .55 + Math.max(0, -sw) * .7; m.kneeR.rotation.x = .55 + Math.max(0, sw) * .7;
}
let lastScreech = -9;
function alertMonster(m) {
  if (m.state !== 'wander') return;
  m.state = 'chase'; m.lose = 0; m.groanT = rnd(2, 4);
  if (time - lastScreech > 1.4) { lastScreech = time; SFX.screech(dist2P(m)); flickerBurst = 1.1; }
  if (time - lastPain > 5) { lastPain = time; painMsg(m); }
}
function pickWp(m) {
  const z = m.zone;
  m.wp = z ? { x: clamp(z.x + rnd(-z.r, z.r), -18, 18), z: clamp(z.z + rnd(-z.r, z.r), -14, 14) } : { x: rnd(-17, 17), z: rnd(-13, 13) };
}
function wakeMonster(m) {
  if (m.state !== 'dormant') return;
  m.state = 'waking'; m.t = 0; SFX.groan(dist2P(m));
}
function dist2P(m) { return Math.hypot(m.g.position.x - player.pos.x, m.g.position.z - player.pos.z); }

function hurtMonster(m, dmg, pt, dir) {
  if (m.state === 'dying') return;
  if (m.firstHitT === undefined) m.firstHitT = time;
  m.shotsHit = (m.shotsHit || 0) + 1;
  m.hp -= dmg; m.flash = .08;
  m.mats.forEach(mt => mt.emissive.setHex(0x661111));
  burst(pt, pBlood, 5, 3);
  SFX.hitEnemy();
  if (m.hp > 0) playScream(dist2P(m), .9, true);
  if (m.state === 'dormant') wakeMonster(m);
  if (m.state === 'wander') { alertMonster(m); monsters.forEach(o => { if (o.state === 'wander' && Math.hypot(o.g.position.x - m.g.position.x, o.g.position.z - m.g.position.z) < 9) alertMonster(o); }); }
  if (dmg >= 25 && m.state === 'chase') {
    m.stun = .4; m.windup = 0;
    m.g.position.x += dir.x * .3; m.g.position.z += dir.z * .3; collide(m.g.position, .4);
  }
  if (m.hp <= 0) killMonster(m);
}
function killMonster(m) {
  m.state = 'dying'; m.t = 0; m.fromRot = m.g.rotation.x;
  kills++; updateHUD(); m.label.visible = false;
  const viaBot = WP.current === 'crossbow', st = viaBot ? stats.cb : stats.sg, p = PAIN[m.name];
  st.kills++; st.time += time - (m.firstHitT === undefined ? time : m.firstHitT); st.shots += m.shotsHit || 1;
  if (p) showMsg(viaBot
    ? `<span style="color:#8cf">SEMANTIC BOT</span>: ${m.name.toUpperCase()} eliminated<br><span style="font-size:16px;color:#ddd">${p.fix}</span>`
    : `${m.name.toUpperCase()} eliminated the hard way<br><span style="font-size:16px;color:#ddd">${p.pain}</span>`, 4.5);
  burst(V3(m.g.position.x, 1.2, m.g.position.z), pBlood, 30, 4.5);
  gibs(V3(m.g.position.x, 1.2, m.g.position.z), 9);
  bloodPool(m.g.position.x, m.g.position.z);
  SFX.die(dist2P(m));
  if (kills >= TOTAL_MONSTERS) setTimeout(() => { if (state === 'play') endGame(true); }, 1400);
}

function updateMonster(m, dt) {
  const g = m.g, P = player.pos;
  if (m.flash > 0) { m.flash -= dt; if (m.flash <= 0) m.mats.forEach(mt => mt.emissive.setHex(0)); }
  if (m.state === 'dormant') {
    if (m.wakeIn !== null) { m.wakeIn -= dt; if (m.wakeIn <= 0) wakeMonster(m); }
    else if (dist2P(m) < 6) wakeMonster(m);
    return;
  }
  if (m.state === 'waking') {
    m.t += dt; const k = Math.min(1, m.t / 1.4), e = k * k * (3 - 2 * k);
    g.rotation.x = -Math.PI / 2 * (1 - e); g.position.y = .18 * (1 - e);
    if (k >= 1) m.state = 'chase';
    return;
  }
  if (m.state === 'dying') {
    m.t += dt; const k = Math.min(1, m.t / .6);
    g.rotation.x = m.fromRot + (-Math.PI / 2 - m.fromRot) * k; g.position.y = .18 * k;
    return;
  }
  if (m.state === 'wander') {
    const d = dist2P(m);
    if (!player.up && d < ((keys.ShiftLeft || keys.ShiftRight) ? 14 : 10) + (m.zone ? 4 : 0)) { alertMonster(m); return; }
    let moved = 0;
    if (m.pause > 0) m.pause -= dt;
    else {
      if (!m.wp) pickWp(m);
      const wx = m.wp.x - g.position.x, wz = m.wp.z - g.position.z, wd = Math.hypot(wx, wz);
      if (wd < .7) { m.pause = rnd(1, 3.5); pickWp(m); }
      else {
        const step = 1.25 * dt, bx0 = g.position.x, bz0 = g.position.z;
        g.position.x += wx / wd * step; g.position.z += wz / wd * step;
        const ta = Math.atan2(wx, wz), df = Math.atan2(Math.sin(ta - g.rotation.y), Math.cos(ta - g.rotation.y));
        g.rotation.y += df * Math.min(1, dt * 4);
        collide(g.position, .4);
        moved = Math.hypot(g.position.x - bx0, g.position.z - bz0);
        if (moved < step * .4) { m.stuck += dt; if (m.stuck > .5) { pickWp(m); m.stuck = 0; } } else m.stuck = 0;
      }
    }
    m.groanT -= dt; if (m.groanT <= 0) { m.groanT = rnd(6, 12); SFX.groan(d); }
    m.phase += moved * 3; const sw = Math.sin(m.phase);
    m.legL.rotation.x = sw * .6; m.legR.rotation.x = -sw * .6;
    m.armL.rotation.x += (-.9 - m.armL.rotation.x) * Math.min(1, dt * 6);
    m.armR.rotation.x += (-.9 - m.armR.rotation.x) * Math.min(1, dt * 6);
    g.position.y = Math.abs(sw) * .03;
    animExtra(m, dt, false);
    return;
  }
  // chase
  if (player.up) { m.lose += dt; if (m.lose > 6) { m.state = 'wander'; pickWp(m); return; } } else m.lose = 0;
  const dx = P.x - g.position.x, dz = P.z - g.position.z, dist = Math.hypot(dx, dz);
  g.rotation.y = Math.atan2(dx, dz);
  m.atk -= dt;
  if (m.stun > 0) { m.stun -= dt; return; }
  let moved = 0;
  if (dist > 1.15) {
    let ang = Math.atan2(dx, dz);
    if (m.sideT > 0) { m.sideT -= dt; ang += m.sideDir * 1.1; }
    const bx0 = g.position.x, bz0 = g.position.z, step = m.speed * dt;
    g.position.x += Math.sin(ang) * step; g.position.z += Math.cos(ang) * step;
    for (const o of monsters) {
      if (o === m || o.state === 'dying' || o.state === 'dormant') continue;
      const ox = g.position.x - o.g.position.x, oz = g.position.z - o.g.position.z, od = Math.hypot(ox, oz);
      if (od < .8 && od > .001) { g.position.x += ox / od * (.8 - od) * .5; g.position.z += oz / od * (.8 - od) * .5; }
    }
    collide(g.position, .4);
    moved = Math.hypot(g.position.x - bx0, g.position.z - bz0);
    if (moved < step * .4) { m.stuck += dt; if (m.stuck > .35) { m.sideT = 1; m.sideDir = Math.random() < .5 ? -1 : 1; m.stuck = 0; } } else m.stuck = 0;
  }
  // attack
  if (!player.up && dist < 1.6 && m.atk <= 0 && m.windup <= 0) { m.windup = .35; m.atk = 1.0; SFX.swing(); }
  if (m.windup > 0) {
    m.windup -= dt;
    if (m.windup <= 0 && dist < 1.95 && !player.up) hurtPlayer(28);
  }
  // groans
  m.groanT -= dt; if (m.groanT <= 0) { m.groanT = rnd(4, 8); if (Math.random() < .35) playScream(dist, .7); else SFX.groan(dist); }
  // animation
  m.phase += dt * (moved / dt || 0) * 2.4;
  const sw = Math.sin(m.phase);
  m.legL.rotation.x = sw * .7; m.legR.rotation.x = -sw * .7;
  const raise = m.windup > 0 ? -2.4 : -1.4 + Math.sin(m.phase * .5) * .1;
  m.armL.rotation.x += (raise - m.armL.rotation.x) * Math.min(1, dt * 18);
  m.armR.rotation.x += (raise - m.armR.rotation.x) * Math.min(1, dt * 18);
  g.position.y = Math.abs(sw) * .04;
  animExtra(m, dt, true);
}

// ---------------------------------------------------------------- pickups
const pickups = [];
function addPickup(type, x, z, yOff) {
  yOff = yOff || 0;
  let mesh, baseY = .5 + yOff; const extras = [];
  if (type === 'ammo') {
    mesh = new THREE.Group();
    bx(.42, .26, .3, new THREE.MeshStandardMaterial({ color: 0x9a1a14 }), 0, 0, 0, mesh);
    bx(.43, .08, .31, new THREE.MeshStandardMaterial({ color: 0xe0c030 }), 0, 0, 0, mesh);
  } else if (type === 'health') {
    mesh = new THREE.Group();
    bx(.42, .3, .3, new THREE.MeshStandardMaterial({ color: 0xeeeeee, emissive: 0x222222 }), 0, 0, 0, mesh);
    const red = new THREE.MeshBasicMaterial({ color: 0xdd1111 });
    bx(.26, .08, .32, red, 0, 0, 0, mesh); bx(.08, .26, .32, red, 0, 0, 0, mesh);
  } else {
    mesh = buildCrossbow(); mesh.scale.setScalar(1.3); mesh.rotation.x = -.2; baseY = 1.75;
    const lb = nameSprite('SEMANTIC BOT', '#8cf', true); lb.scale.set(6, 1.13, 1); lb.position.set(x, 3.6, z); scene.add(lb); extras.push(lb);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, 8, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x66bbff, transparent: true, opacity: .3, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    beam.position.set(x, 4, z); scene.add(beam); extras.push(beam);
    const l = new THREE.PointLight(0x66bbff, 2.2, 11, 1.4); l.position.set(x, 2.2, z); scene.add(l); extras.push(l);
  }
  mesh.position.set(x, baseY, z); scene.add(mesh);
  pickups.push({ type, mesh, x, z, baseY, taken: false, extras, yOff });
}
addPickup('crossbow', -16, -14);
addPickup('ammo', -8, 0); addPickup('ammo', 13, 8); addPickup('ammo', -10, 13, PLAT_Y);
addPickup('health', -16, -3); addPickup('health', 2, -7);

function updatePickups(dt) {
  for (const p of pickups) {
    if (p.taken) continue;
    p.mesh.rotation.y += dt * 1.4;
    p.mesh.position.y = p.baseY + Math.sin(time * 2.2 + p.x) * .08;
    if (Math.hypot(p.x - player.pos.x, p.z - player.pos.z) > (p.type === 'crossbow' ? 2.0 : 1.1) || Math.abs(player.floorY - p.yOff) > 1.5) continue;
    if (p.type === 'ammo') {
      p.taken = true; WP.sg.reserve += 6; showMsg('+6 SHOTGUN SHELLS');
    } else if (p.type === 'health') {
      if (player.hp >= 100) continue;
      p.taken = true; player.hp = Math.min(100, player.hp + 40); showMsg('+40 HEALTH');
    } else {
      p.taken = true; WP.hasCross = true; setWeapon('crossbow');
      showMsg('SEMANTIC BOT ACQUIRED<br><span style="font-size:15px;color:#9cf">one source of truth for every team<br>one shot kills, fast reload, never runs out</span>', 4);
      monsters.forEach(m => { if (m.state === 'dormant') m.wakeIn = rnd(.4, 2.2); });
      p.extras.forEach(o => { o.visible = false; });
    }
    p.mesh.visible = false; SFX.pickup(); updateHUD();
  }
}

// ---------------------------------------------------------------- shooting
const ray = new THREE.Raycaster();
function targets() {
  const t = world.slice();
  for (const m of monsters) if (m.state !== 'dying') for (const me of m.meshes) t.push(me);
  return t;
}
function monsterDirXZ(m) {
  return V3(m.g.position.x - player.pos.x, 0, m.g.position.z - player.pos.z).normalize();
}
function fireShotgun() {
  const s = WP.sg;
  if (s.cd > 0) return;
  if (s.ammo <= 0) {
    if (s.reserve > 0) startReload(); else { SFX.empty(); s.cd = .35; showMsg('OUT OF SHELLS'); }
    return;
  }
  s.ammo--; s.cd = .85; s.reloading = false;
  WP.recoil = 1; WP.flashT = .06; SFX.shotgun();
  monsters.forEach(m => { if (dist2P(m) < 22) alertMonster(m); }); player.shake = Math.max(player.shake, .6);
  const tg = targets();
  const dmgByMon = new Map();
  for (let i = 0; i < 9; i++) {
    const r = .075 * Math.sqrt(Math.random()), th = rnd(0, 6.283);
    const dir = V3(Math.cos(th) * r, Math.sin(th) * r, -1).normalize().applyQuaternion(camera.quaternion);
    ray.set(camera.position, dir); ray.far = 40;
    const h = ray.intersectObjects(tg, false)[0];
    if (!h) continue;
    const mon = h.object.userData.mon;
    if (mon) {
      let d = 5 * (1 - clamp((h.distance - 4) / 14, 0, .75));
      if (h.object.userData.head) d *= 2;
      const e = dmgByMon.get(mon) || { d: 0, pt: h.point };
      e.d += d; dmgByMon.set(mon, e);
    } else burst(h.point, pSpark, 2, 2);
  }
  dmgByMon.forEach((e, mon) => { hurtMonster(mon, e.d, e.pt, monsterDirXZ(mon)); showHit(); });
}
function fireCrossbow() {
  const c = WP.cb;
  if (c.cd > 0) return;
  c.cd = .45; c.boltT = .28; cbVM.userData.bolt.visible = false;
  WP.recoil = .8; SFX.crossbow();
  const fwd = V3(0, 0, -1).applyQuaternion(camera.quaternion);
  const tg = targets();
  ray.set(camera.position, fwd); ray.far = 80;
  let h = ray.intersectObjects(tg, false)[0];
  let mon = h && h.object.userData.mon, pt = h ? h.point : camera.position.clone().addScaledVector(fwd, 40);
  if (!mon) {   // generous aim assist
    let best = null, bestAng = .075;
    for (const m of monsters) {
      if (m.state === 'dying') continue;
      const c2 = V3(m.g.position.x, m.state === 'dormant' ? .3 : 1.3, m.g.position.z);
      const v = c2.clone().sub(camera.position), d = v.length();
      const ang = Math.acos(clamp(v.normalize().dot(fwd), -1, 1));
      if (ang < bestAng && d < 60) {
        ray.set(camera.position, v); ray.far = d + 1;
        const hh = ray.intersectObjects(tg, false)[0];
        if (hh && hh.object.userData.mon === m) { best = { m, pt: c2 }; bestAng = ang; }
      }
    }
    if (best) { mon = best.m; pt = best.pt; }
  }
  addTracer(camera.localToWorld(V3(.1, -.1, -.9)), pt);
  if (mon) { hurtMonster(mon, 100, pt, monsterDirXZ(mon)); showHit(); }
  else if (h) burst(pt, pSpark, 4, 2.5);
}

// ---------------------------------------------------------------- HUD
let msgTimer = 0, hitT = 0, hurtT = 0;
function showMsg(html, dur) { const e = $('msg'); e.innerHTML = html; e.style.opacity = 1; msgTimer = dur || 2.2; }
function showHit() { hitT = .15; $('hit').style.opacity = 1; }
function updateHUD() {
  $('obj').textContent = `MONSTERS ${kills} / ${TOTAL_MONSTERS}`;
  $('hint').textContent = WP.hasCross ? 'ONE SOURCE OF TRUTH: NOW ELIMINATE THEM ALL' : 'TO SURVIVE YOU NEED THE SEMANTIC BOT';
  const hp = Math.max(0, player.hp);
  const f = $('hpfill'); f.style.width = hp + '%';
  f.style.background = hp > 60 ? '#2fa84f' : hp > 30 ? '#d0a020' : '#c01818';
  if (WP.current === 'shotgun' || WP.pending === 'shotgun') {
    $('wname').textContent = 'SHOTGUN'; $('wammo').textContent = `${WP.sg.ammo} / ${WP.sg.reserve}`;
  } else { $('wname').textContent = 'SEMANTIC BOT'; $('wammo').textContent = '∞'; }
}
function hurtPlayer(n) {
  if (state !== 'play') return;
  player.hp -= n; hurtT = .5; player.shake = 1; SFX.hurt(); updateHUD();
  if (player.hp <= 0) endGame(false);
}
function endGame(win) {
  state = win ? 'win' : 'dead';
  document.exitPointerLock && document.exitPointerLock();
  const ov = $('overlay');
  $('ovtitle').textContent = win ? 'YOU SURVIVED' : 'YOU DIED';
  $('ovtitle').style.color = win ? '#3c9' : '#b00d0d';
  $('ovsub').textContent = win ? 'ONE SOURCE OF TRUTH, FOR EVERY TEAM' : 'THE WAREHOUSE CLAIMS ANOTHER';
  $('ovctl').innerHTML = statsHTML(); $('ovctl').style.display = 'inline-block';
  $('ovbtn').textContent = 'CLICK TO PLAY AGAIN';
  setTimeout(() => { ov.style.display = 'flex'; }, win ? 200 : 1200);
}

// ---------------------------------------------------------------- input
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (state !== 'play') return;
  if (e.code === 'KeyR') startReload();
  if (e.code === 'Digit1') setWeapon('shotgun');
  if (e.code === 'Digit2') setWeapon('crossbow');
  if (e.code === 'Digit0' && !WP.hasCross) { player.pos.set(-12, 1.7, -9.5); player.up = false; }   // demo shortcut: teleport to crossbow
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('mousedown', e => { if (e.button === 0) mouseDown = true; });
addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; });
addEventListener('mousemove', e => {
  if (state !== 'play' || document.pointerLockElement !== canvas) return;
  player.yaw -= e.movementX * .0022;
  player.pitch = clamp(player.pitch - e.movementY * .0022, -1.45, 1.45);
});
$('overlay').addEventListener('click', () => {
  if (state === 'dead' || state === 'win') { location.reload(); return; }
  initAudio(); if (AC && AC.state === 'suspended') AC.resume();
  stopTitleMusic(); playMusic();
  try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) {}
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) {
    if (state === 'menu' || state === 'paused') {
      if (state === 'menu') showMsg('TO SURVIVE YOU NEED THE <span style="color:#8cf">SEMANTIC BOT</span><br><span style="font-size:15px;color:#aaa">You are on the 2nd floor. The monsters roam below. Take the stairs on the right, then follow the blue light in the far corner. It is guarded.</span>', 7);
      state = 'play'; $('overlay').style.display = 'none';
    }
  } else if (state === 'play') {
    state = 'paused';
    music.pause();
    $('ovtitle').textContent = 'PAUSED'; $('ovtitle').style.color = '#b00d0d';
    $('ovsub').textContent = ''; $('ovbtn').textContent = 'CLICK TO RESUME';
    $('ovctl').innerHTML = legendHTML(); $('ovctl').style.display = 'inline-block';
    $('overlay').style.display = 'flex';
  }
});

// ---------------------------------------------------------------- spawn
makeMonster(-12, -2, false, 'Platform Team');
makeMonster(-14, -4, false, 'dbt Aggregate').zone = { x: -15, z: -11, r: 6.5 };
makeMonster(-3, 4, false, 'Semantic Layer');
// three guards patrol around the Semantic Bot
[['Testing', -13, -10], ['Dashboard', -12, -14], ['Maintenance', -18, -8]].forEach(([n, x, z]) => {
  const gm = makeMonster(x, z, false, n); gm.zone = { x: -15, z: -11, r: 6.5 }; gm.speed *= 1.1;
});
updateHUD();

// ---------------------------------------------------------------- update
function update(dt) {
  // movement
  const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const sprint = keys.ShiftLeft || keys.ShiftRight;
  const sp = sprint ? 6.4 : 4.2;
  let mx = -Math.sin(player.yaw) * f + Math.cos(player.yaw) * s;
  let mz = -Math.cos(player.yaw) * f - Math.sin(player.yaw) * s;
  const len = Math.hypot(mx, mz);
  if (len > 0) { mx /= len; mz /= len; }
  player.pos.x += mx * sp * dt; player.pos.z += mz * sp * dt;
  collide(player.pos, .35, player.up ? 2 : 1);
  {   // which floor am I on?
    const px = player.pos.x, pz = player.pos.z;
    if (px >= 16 && px <= 19.7 && pz >= 2 && pz <= 10) {
      player.floorY = clamp(.5 * Math.ceil(pz - 2), 0, PLAT_Y); player.up = player.floorY > 2;
    } else player.floorY = player.up ? PLAT_Y : 0;
    player.pos.y += (player.floorY + 1.7 - player.pos.y) * Math.min(1, dt * 14);
  }
  player.moving += ((len > 0 ? 1 : 0) - player.moving) * Math.min(1, dt * 10);
  player.bob += dt * (sprint ? 12 : 8) * (len > 0 ? 1 : 0);

  // camera
  player.shake = Math.max(0, player.shake - dt * 3);
  const sh = player.shake * .03;
  camera.position.set(player.pos.x + rnd(-sh, sh), player.pos.y + Math.sin(player.bob * 2) * .035 * player.moving + rnd(-sh, sh), player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0);

  // weapons
  const sg = WP.sg, cb = WP.cb;
  sg.cd = Math.max(0, sg.cd - dt); cb.cd = Math.max(0, cb.cd - dt);
  if (WP.switchT > 0) {
    WP.switchT -= dt;
    if (WP.switchT <= .25 && WP.pending) {
      WP.current = WP.pending; WP.pending = null;
      sgVM.visible = WP.current === 'shotgun'; cbVM.visible = WP.current === 'crossbow';
      updateHUD();
    }
  }
  if (cb.boltT > 0) { cb.boltT -= dt; if (cb.boltT <= 0) { cbVM.userData.bolt.visible = true; SFX.cbLoad(); } }
  if (sg.reloading && sg.cd <= 0) {
    sg.rt -= dt;
    if (sg.rt <= 0) {
      sg.ammo++; sg.reserve--; SFX.shell(); updateHUD();
      if (sg.ammo >= sg.cap || sg.reserve <= 0) { sg.reloading = false; SFX.pump(.05); } else sg.rt = .5;
    }
  }
  if (mouseDown && WP.switchT <= 0) {
    if (WP.current === 'shotgun') { fireShotgun(); updateHUD(); } else fireCrossbow();
  }
  // viewmodel
  WP.recoil = Math.max(0, WP.recoil - dt * 4.5);
  const swapOff = WP.switchT > 0 ? .5 * Math.sin(Math.PI * (1 - WP.switchT / .5)) : 0;
  const reloadOff = sg.reloading ? .07 : 0;
  vm.position.set(.24 + Math.cos(player.bob) * .008 * player.moving,
    -.24 + Math.abs(Math.sin(player.bob)) * .012 * player.moving - swapOff - reloadOff,
    -.5 + WP.recoil * .12);
  vm.rotation.x = WP.recoil * .2 + (sg.reloading ? -.35 : 0);
  if (WP.flashT > 0) {
    WP.flashT -= dt; sgVM.userData.flash.visible = true; flash.intensity = 4;
    sgVM.userData.flash.material.rotation = rnd(0, 6);
    if (WP.flashT <= 0) { sgVM.userData.flash.visible = false; flash.intensity = 0; }
  }

  // world
  monsters.forEach(m => updateMonster(m, dt));
  updatePickups(dt);

  updateBotMarker();
  // fear: heartbeat + red vignette when a hunter is close
  let dmin = 99;
  for (const m of monsters) if (m.state === 'chase') dmin = Math.min(dmin, dist2P(m));
  const fear = clamp(1 - dmin / 11, 0, 1) * (player.up ? .5 : 1);
  hbT -= dt; if (fear > .05 && hbT <= 0) { hbT = 1.1 - .65 * fear; SFX.heart(fear); }
  fearLevel = fear;
  fearEl.style.opacity = fear * (.65 + .35 * Math.sin(time * (4 + fear * 6)));
  player.shake = Math.max(player.shake, fear * .12);
  // hud timers
  if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) $('msg').style.opacity = 0; }
  if (hitT > 0) { hitT -= dt; if (hitT <= 0) $('hit').style.opacity = 0; }
  if (hurtT > 0) { hurtT -= dt; $('hurt').style.opacity = clamp(hurtT / .5, 0, 1); }
  else $('hurt').style.opacity = player.hp < 30 ? .35 + Math.sin(time * 6) * .15 : 0;
}

const botMarker = document.createElement('div');
botMarker.style.cssText = 'position:fixed;pointer-events:none;color:#8cf;font:bold 15px Georgia,serif;letter-spacing:2px;text-shadow:0 0 8px #08f,0 0 3px #000;transform:translate(-50%,-50%);white-space:nowrap;display:none';
document.body.appendChild(botMarker);
const botPos = V3(-16, 2.2, -14);
function updateBotMarker() {
  if (WP.hasCross || state !== 'play') { botMarker.style.display = 'none'; return; }
  const v = botPos.clone().project(camera);
  let x = v.x, y = v.y;
  if (v.z > 1) { x = -x; y = -y; }
  const k = Math.max(Math.abs(x), Math.abs(y));
  const off = k > .9 || v.z > 1;
  if (off) { const sc = .9 / Math.max(k, .001); x *= sc; y *= sc; }
  botMarker.style.display = 'block';
  botMarker.style.left = ((x * .5 + .5) * innerWidth) + 'px';
  botMarker.style.top = ((-y * .5 + .5) * innerHeight) + 'px';
  botMarker.textContent = (off ? '\u25C6 ' : '\u25BC ') + 'SEMANTIC BOT  ' + Math.round(camera.position.distanceTo(botPos)) + ' m';
}
const fearEl = document.createElement('div');
fearEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;opacity:0;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 35%,rgba(110,0,0,.8) 100%)';
document.body.appendChild(fearEl);
let hbT = 0;
let deathT = 0;
function deathCam(dt) {
  deathT += dt;
  player.pos.y = Math.max(.35, player.pos.y - dt * 2);
  camera.position.copy(player.pos);
  camera.rotation.z = Math.min(.9, camera.rotation.z + dt * .9);
  camera.rotation.x += (-.4 - camera.rotation.x) * dt * 2;
  monsters.forEach(m => { if (m.state === 'chase') { m.groanT = 99; } });
  $('hurt').style.opacity = .6;
}

// ---------------------------------------------------------------- loop
const DEBUG = location.hash.startsWith('#debug');
if (DEBUG) {   // dev helper: ?#debug hides the overlay and lets a screenshot be taken
  $('overlay').style.display = 'none';
  const q = new URLSearchParams(location.hash.slice(7));
  if (q.get('x')) player.pos.set(+q.get('x'), +q.get('y'), +q.get('z'));
  if (q.get('yaw')) player.yaw = +q.get('yaw');
  if (q.get('pitch')) player.pitch = +q.get('pitch');
}
const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), .05);
  if (state !== 'paused') {
    time += dt;
    updateLamps(dt, time);
    updateParticles(dt);
    if (state === 'play') update(dt);
    else if (state === 'dead') deathCam(dt);
    else if (state === 'menu') {
      if (DEBUG) { camera.position.copy(player.pos); camera.rotation.set(player.pitch, player.yaw, 0); } else { camera.position.set(0, 1.7 + PLAT_Y, 13); camera.rotation.set(-.3, Math.sin(time * .3) * .3, 0); }
    }
  }
  updateDust(dt);
  if (composer) {
    grade.uniforms.time.value = time; grade.uniforms.fear.value = fearLevel; grade.uniforms.hurt.value = Math.max(0, hurtT);
    composer.render(dt);
  } else renderer.render(scene, camera);
}
loop();
