/* رحلة «سافر مع عبدالله»: مشهد ثلاثي الأبعاد كارتوني يمشي مع النزول بالصفحة.
   الفصول: غرفة بيضاء بيها طيارة على منصة ← الطيارة تطلع من القوس وتطير بين الغيوم ←
   جواز بضو سبوت ويفتح والأختام تدور حوله ← كرة أرضية تلف على الوجهات ← شنط وتذاكر طايرة.
   كل الحركة مربوطة بنسبة النزول p (من 0 إلى 1). */
import * as THREE from "./three.module.min.js";

const APP = window.APP;
const stage = document.getElementById("stage");
const canvas = document.getElementById("gl");
const chEls = [...document.querySelectorAll(".ch")];
const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ============ الألوان ============ */
const C = {
  ink: 0x1d1b2f, cream: 0xf6efe3, wall: 0xf3e8d6, floor: 0xead9bd, white: 0xfffaf2,
  coral: 0xff6b4a, sun: 0xffc845, sky: 0x8fd3ff, skyDeep: 0x55b4ec, mint: 0x45c9a6, leaf: 0x3fb27f,
  navy: 0x24346e, wood: 0xb9774a, dark: 0x17152e, night: 0x101633, plum: 0x2a2552
};

/* ============ أدوات ============ */
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (x) => x * x * (3 - 2 * x);
const seg = (p, a, b) => smooth(clamp((p - a) / (b - a)));
const lerp = (a, b, k) => a + (b - a) * k;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
} catch (e) {
  renderer = null;
}
if (!renderer || !renderer.getContext()) {
  document.documentElement.classList.add("no3d");
} else {
  /* نستنى الخطوط حتى تنكتب صح على الجواز والتذاكر */
  const go = () => { try { main(); } catch (e) { console.error(e); document.documentElement.classList.add("no3d"); } };
  Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise((r) => setTimeout(r, 1500))]).then(go);
}

function main() {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const bg = new THREE.Color(C.cream);
  scene.background = bg;
  scene.fog = new THREE.Fog(C.cream, 26, 62);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);

  const hemi = new THREE.HemisphereLight(0xffffff, 0xd8c3a0, 2.2);
  const sunLight = new THREE.DirectionalLight(0xffffff, 2.4);
  sunLight.position.set(6, 10, 8);
  scene.add(hemi, sunLight, sunLight.target);

  /* ---------- مواد الكارتون: ظل بثلاث درجات + حد أسود ---------- */
  const grad = new THREE.DataTexture(new Uint8Array([110, 110, 110, 255, 190, 190, 190, 255, 255, 255, 255, 255]), 3, 1);
  grad.minFilter = grad.magFilter = THREE.NearestFilter;
  grad.needsUpdate = true;
  const mats = {};
  const toon = (c) => mats[c] || (mats[c] = new THREE.MeshToonMaterial({ color: c, gradientMap: grad }));
  const inkMat = new THREE.MeshBasicMaterial({ color: C.ink, side: THREE.BackSide });

  /* قطعة كارتونية: شكل + حد أسود بسمك ثابت تقريباً */
  function part(geo, mat, o = {}) {
    const m = new THREE.Mesh(geo, typeof mat === "number" ? toon(mat) : mat);
    if (o.pos) m.position.set(...o.pos);
    if (o.rot) m.rotation.set(...o.rot);
    if (o.scale) m.scale.set(...o.scale);
    const t = o.line === undefined ? 0.045 : o.line;
    if (t) {
      geo.computeBoundingSphere();
      const r = geo.boundingSphere.radius || 1;
      const ol = new THREE.Mesh(geo, inkMat);
      ol.scale.setScalar(1 + t / r);
      ol.position.copy(geo.boundingSphere.center).multiplyScalar(-t / r);
      m.add(ol);
    }
    return m;
  }
  function canvasTex(w, h, draw) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    tx.anisotropy = 4;
    return tx;
  }
  const FONT = '"Baloo Bhaijaan 2", "Noto Kufi Arabic", system-ui, sans-serif';

  /* ============ الطيارة ============ */
  function makePlane() {
    const g = new THREE.Group();
    g.add(part(new THREE.CapsuleGeometry(0.55, 2.5, 8, 24), C.white, { rot: [Math.PI / 2, 0, 0] }));
    g.add(part(new THREE.SphereGeometry(0.43, 20, 14), C.navy, { pos: [0, 0.24, 1.3], scale: [1, 0.55, 0.85], line: 0.03 }));
    g.add(part(new THREE.CylinderGeometry(0.56, 0.56, 0.22, 24), C.coral, { pos: [0, 0, -0.35], rot: [Math.PI / 2, 0, 0], line: 0.03 }));
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
      g.add(part(new THREE.SphereGeometry(0.1, 10, 8), C.skyDeep, { pos: [s * 0.52, 0.14, 0.75 - i * 0.36], line: 0 }));
    }
    const wing = part(new THREE.BoxGeometry(4.8, 0.14, 1.05), C.coral, { pos: [0, -0.12, 0.15] });
    g.add(wing);
    for (const s of [-1, 1]) {
      g.add(part(new THREE.BoxGeometry(0.12, 0.42, 0.55), C.sun, { pos: [s * 2.38, 0.08, -0.05], line: 0.03 }));
      const eng = part(new THREE.CylinderGeometry(0.25, 0.2, 0.8, 18), C.sun, { pos: [s * 1.25, -0.42, 0.42], rot: [Math.PI / 2, 0, 0] });
      eng.add(part(new THREE.CircleGeometry(0.17, 18), C.ink, { pos: [0, 0.41, 0], rot: [-Math.PI / 2, 0, 0], line: 0 }));
      g.add(eng);
    }
    g.add(part(new THREE.BoxGeometry(0.14, 1.05, 0.85), C.coral, { pos: [0, 0.78, -1.5], rot: [-0.38, 0, 0] }));
    g.add(part(new THREE.BoxGeometry(1.8, 0.1, 0.55), C.coral, { pos: [0, 0.18, -1.55] }));
    return g;
  }
  const plane = makePlane();
  scene.add(plane);

  /* ============ فصل 0: الغرفة البيضاء ============ */
  const room = new THREE.Group();
  scene.add(room);
  room.add(part(new THREE.PlaneGeometry(80, 44), C.floor, { pos: [0, -1.2, 4], rot: [-Math.PI / 2, 0, 0], line: 0 }));
  {
    const s = new THREE.Shape();
    s.moveTo(-40, -1.2); s.lineTo(40, -1.2); s.lineTo(40, 24); s.lineTo(-40, 24); s.lineTo(-40, -1.2);
    const hole = new THREE.Path();
    hole.moveTo(-3, -1.05); hole.lineTo(3, -1.05); hole.lineTo(3, 3); hole.absarc(0, 3, 3, 0, Math.PI, false); hole.lineTo(-3, -1.05);
    s.holes.push(hole);
    const wall = new THREE.Mesh(new THREE.ShapeGeometry(s, 32), toon(C.wall));
    wall.position.z = -8;
    room.add(wall);
    room.add(part(new THREE.TorusGeometry(3.15, 0.2, 12, 48, Math.PI), C.coral, { pos: [0, 3, -7.9] }));
    for (const x of [-3.15, 3.15]) room.add(part(new THREE.BoxGeometry(0.4, 4.2, 0.4), C.coral, { pos: [x, 0.9, -7.9] }));
    for (const x of [-9.5, 9.5]) {
      room.add(part(new THREE.TorusGeometry(1.7, 0.14, 10, 40, Math.PI), C.sun, { pos: [x, 2.6, -7.9] }));
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.8), toon(0xe9dcc4));
      panel.position.set(x, 0.7, -7.95);
      room.add(panel);
      room.add(part(new THREE.CircleGeometry(1.7, 40, 0, Math.PI), 0xe9dcc4, { pos: [x, 2.6, -7.95], line: 0 }));
    }
  }
  /* نخلتين بسنادين */
  function palm(x, z) {
    const g = new THREE.Group();
    g.add(part(new THREE.CylinderGeometry(0.7, 0.5, 1.1, 20), C.coral, { pos: [0, -0.65, 0] }));
    for (let i = 0; i < 5; i++) g.add(part(new THREE.CylinderGeometry(0.16, 0.2, 0.62, 10), C.wood, { pos: [Math.sin(i * 0.5) * 0.12, 0.1 + i * 0.55, 0], rot: [0, 0, Math.sin(i) * 0.08], line: 0.03 }));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const leaf = part(new THREE.SphereGeometry(0.9, 14, 10), C.leaf, { scale: [1.1, 0.16, 0.42], line: 0.03 });
      leaf.position.set(Math.cos(a) * 0.8, 2.85 - 0.12, Math.sin(a) * 0.8);
      leaf.rotation.set(0, -a, -0.45);
      g.add(leaf);
    }
    g.position.set(x, 0, z);
    return g;
  }
  room.add(palm(-6.2, -5.4), palm(6.2, -5.4));
  /* المنصة */
  const pedestal = new THREE.Group();
  pedestal.add(part(new THREE.CylinderGeometry(1.7, 1.9, 0.9, 48), C.white, { pos: [0, -0.75, 0] }));
  pedestal.add(part(new THREE.TorusGeometry(1.72, 0.09, 8, 48), C.coral, { pos: [0, -0.3, 0], rot: [Math.PI / 2, 0, 0], line: 0.02 }));
  const blob = new THREE.Mesh(new THREE.CircleGeometry(1.5, 32), new THREE.MeshBasicMaterial({
    map: canvasTex(128, 128, (g, w) => { const r = g.createRadialGradient(64, 64, 4, 64, 64, 64); r.addColorStop(0, "rgba(29,27,47,.35)"); r.addColorStop(1, "rgba(29,27,47,0)"); g.fillStyle = r; g.fillRect(0, 0, w, w); }),
    transparent: true, depthWrite: false
  }));
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = -0.28;
  pedestal.add(blob);
  room.add(pedestal);
  /* سما ورا القوس */
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(140, 70), new THREE.MeshBasicMaterial({ color: C.sky, fog: false }));
  backdrop.position.set(0, 10, -40);
  scene.add(backdrop);

  /* ============ فصل 1: السما والغيوم ============ */
  const sky = new THREE.Group();
  scene.add(sky);
  function cloud(s) {
    const g = new THREE.Group();
    const n = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const r = 0.7 + Math.random() * 0.7;
      g.add(part(new THREE.SphereGeometry(r, 16, 12), C.white, { pos: [(i - n / 2) * 0.85 + Math.random() * 0.3, Math.sin((i / (n - 1)) * Math.PI) * 0.5 + Math.random() * 0.2, Math.random() * 0.5], line: 0.06 }));
    }
    g.scale.setScalar(s);
    return g;
  }
  const clouds = [];
  {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const realRandom = Math.random;
    Math.random = rnd;
    for (let i = 0; i < 70; i++) {
      const z = -12 - rnd() * 84;
      let x = (rnd() - 0.5) * 30, y = -2 + rnd() * 16;
      const py = 2 + ((-z) / 90) * 7;
      /* لا تحط غيمة على طريق الطيارة أو الكاميرا اللي وراها */
      const near = (cx) => Math.abs(x - cx) < 3.4 && Math.abs(y - py - 0.8) < 3.2;
      if (near(0) || near(-3) || near(-5.5)) y += y > py ? 4.5 : -4.5;
      const c = cloud(0.8 + rnd() * 1.1);
      c.position.set(x, y, z);
      c.userData.drift = rnd() * Math.PI * 2;
      sky.add(c);
      clouds.push(c);
    }
    Math.random = realRandom;
  }
  sky.add(part(new THREE.SphereGeometry(5, 32, 20), new THREE.MeshBasicMaterial({ color: C.sun, fog: false }), { pos: [26, 20, -110], line: 0 }));

  /* ============ فصل 2: الجواز والأختام ============ */
  const PZ = -120;
  const visa = new THREE.Group();
  visa.position.set(0, 0, PZ);
  scene.add(visa);
  visa.add(part(new THREE.CylinderGeometry(5.5, 5.8, 0.4, 56), C.plum, { pos: [0, -2.4, 0] }));
  visa.add(part(new THREE.TorusGeometry(5.55, 0.1, 8, 64), C.sun, { pos: [0, -2.2, 0], rot: [Math.PI / 2, 0, 0], line: 0.02 }));
  const spot = new THREE.SpotLight(0xfff0d0, 0, 30, 0.42, 0.55, 1.2);
  spot.position.set(0, 9, PZ + 2);
  spot.target.position.set(0, 0, PZ);
  scene.add(spot, spot.target);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(3.4, 11, 40, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0d0, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  cone.position.set(0, 3.3, 0);
  visa.add(cone);

  const coverTex = canvasTex(512, 700, (g, w, h) => {
    g.fillStyle = "#24346e"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#f2c14e"; g.lineWidth = 8; g.strokeRect(26, 26, w - 52, h - 52);
    g.fillStyle = "#f2c14e"; g.textAlign = "center";
    g.font = `800 64px ${FONT}`; g.fillText("جواز سفر", w / 2, 150);
    g.font = `700 40px ${FONT}`; g.fillText("PASSPORT", w / 2, 600);
    g.lineWidth = 10; g.beginPath(); g.arc(w / 2, 360, 110, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 6; g.beginPath(); g.ellipse(w / 2, 360, 50, 110, 0, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(w / 2 - 110, 360); g.lineTo(w / 2 + 110, 360); g.stroke();
    g.beginPath(); g.moveTo(w / 2 - 95, 305); g.lineTo(w / 2 + 95, 305); g.moveTo(w / 2 - 95, 415); g.lineTo(w / 2 + 95, 415); g.stroke();
  });
  const STAMPS = [["IST", "#ff6b4a"], ["DXB", "#45c9a6"], ["BKK", "#55b4ec"], ["CAI", "#ffb21f"], ["BEY", "#b55cff"], ["KUL", "#ff6b4a"], ["MCT", "#45c9a6"], ["CMB", "#55b4ec"]];
  function stampDraw(g, w, code, col, rot) {
    g.save(); g.translate(w / 2, w / 2); g.rotate(rot);
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = w * 0.035;
    g.beginPath(); g.arc(0, 0, w * 0.42, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(0, 0, w * 0.33, 0, Math.PI * 2); g.stroke();
    g.textAlign = "center"; g.textBaseline = "middle";
    g.font = `800 ${w * 0.2}px ${FONT}`; g.fillText(code, 0, 0);
    g.font = `700 ${w * 0.07}px ${FONT}`; g.fillText("VISA", 0, -w * 0.2); g.fillText("✈ APPROVED", 0, w * 0.2);
    g.restore();
  }
  const pageTex = canvasTex(512, 700, (g, w, h) => {
    g.fillStyle = "#fbf4e6"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(85,180,236,.25)"; g.lineWidth = 2;
    for (let y = 40; y < h; y += 28) { g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y - 10, w * 0.6, y + 10, w, y); g.stroke(); }
    [[0, 140, 170, -0.3], [3, 370, 190, 0.25], [2, 170, 470, 0.15], [1, 380, 520, -0.2]].forEach(([i, x, y, r]) => {
      g.save(); g.translate(x - 110, y - 110); stampDraw(g, 220, STAMPS[i][0], STAMPS[i][1], r); g.restore();
    });
  });
  const passport = new THREE.Group();
  visa.add(passport);
  const PW = 2.3, PH = 3.1;
  passport.add(part(new THREE.BoxGeometry(PW, PH, 0.09), C.navy, { pos: [0, 0, -0.16] }));
  const pageMats = [toon(0xfbf4e6), toon(0xfbf4e6), toon(0xfbf4e6), toon(0xfbf4e6), new THREE.MeshToonMaterial({ map: pageTex, gradientMap: grad }), toon(0xfbf4e6)];
  passport.add(part(new THREE.BoxGeometry(PW - 0.12, PH - 0.12, 0.22), pageMats, { line: 0.03 }));
  const coverPivot = new THREE.Group();
  coverPivot.position.set(-PW / 2, 0, 0.16);
  passport.add(coverPivot);
  const coverMats = [toon(C.navy), toon(C.navy), toon(C.navy), toon(C.navy), new THREE.MeshToonMaterial({ map: coverTex, gradientMap: grad }), toon(C.navy)];
  coverPivot.add(part(new THREE.BoxGeometry(PW, PH, 0.09), coverMats, { pos: [PW / 2, 0, 0] }));
  passport.position.y = 0.4;

  const stamps = STAMPS.map(([code, col], i) => {
    const tex = canvasTex(256, 256, (g, w) => { g.fillStyle = "#fffaf2"; g.fillRect(0, 0, w, w); stampDraw(g, w, code, col, 0); });
    const face = new THREE.MeshToonMaterial({ map: tex, gradientMap: grad });
    const m = part(new THREE.CylinderGeometry(0.62, 0.62, 0.1, 40), [toon(C.white), face, face], { rot: [Math.PI / 2, 0, 0], line: 0.035 });
    const holder = new THREE.Group();
    holder.add(m);
    holder.userData = { a: (i / STAMPS.length) * Math.PI * 2, r: 2.7 + (i % 2) * 0.5, y: (i % 3) * 0.9 - 0.9, spin: 0.6 + (i % 3) * 0.3 };
    visa.add(holder);
    return holder;
  });

  /* ============ فصل 3: الكرة الأرضية ============ */
  const GZ = -170, R = 4;
  const earth = new THREE.Group();
  earth.position.set(0, 0, GZ);
  scene.add(earth);
  const globe = new THREE.Group();
  globe.rotation.order = "XYZ";
  earth.add(globe);
  const landTex = canvasTex(2048, 1024, (g, w, h) => {
    g.fillStyle = "#55b4ec"; g.fillRect(0, 0, w, h);
    const rows = APP.D.map.rows, sx = w / 720, sy = h / rows.length;
    g.fillStyle = "#5cd39a";
    rows.forEach((row, y) => {
      let x = 0, land = false;
      row.split(".").forEach((n) => { n = +n; if (land && n) g.fillRect(x * sx, y * sy, n * sx + 0.6, sy + 0.6); x += n; land = !land; });
    });
    g.fillStyle = "rgba(255,255,255,.18)";
    for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 3 + Math.random() * 5, 0, Math.PI * 2); g.fill(); }
  });
  globe.add(part(new THREE.SphereGeometry(R, 64, 48), new THREE.MeshToonMaterial({ map: landTex, gradientMap: grad }), { line: 0.08 }));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R + 1.4, 0.035, 8, 120), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));
  ring.rotation.set(1.2, 0.3, 0);
  earth.add(ring);

  /* نقطة على الكرة من خط العرض والطول — نفس ترتيب صورة الخريطة على SphereGeometry */
  function ll2v(lon, lat, r = R) {
    const phi = ((lon + 180) / 360) * Math.PI * 2, th = ((90 - lat) / 180) * Math.PI;
    return V3(-r * Math.cos(phi) * Math.sin(th), r * Math.cos(th), r * Math.sin(phi) * Math.sin(th));
  }
  const STOPS = APP.STOPS;
  const BGW = APP.D.coords.BGW;
  const hubV = ll2v(BGW[0], BGW[1]);
  function pin(color, big) {
    const g = new THREE.Group();
    g.add(part(new THREE.CylinderGeometry(0.035, 0.035, 0.55, 8), C.ink, { pos: [0, 0.27, 0], line: 0 }));
    g.add(part(new THREE.SphereGeometry(big ? 0.24 : 0.17, 16, 12), color, { pos: [0, 0.6, 0], line: 0.03 }));
    return g;
  }
  const up = V3(0, 1, 0);
  function placeOn(obj, v) { obj.position.copy(v); obj.quaternion.setFromUnitVectors(up, v.clone().normalize()); }
  const hubPin = pin(C.sun, true);
  placeOn(hubPin, hubV);
  globe.add(hubPin);
  const pins = [], arcs = [];
  STOPS.forEach((s) => {
    const v = ll2v(s.ll[0], s.ll[1]);
    const p = pin(C.coral);
    placeOn(p, v);
    globe.add(p);
    pins.push(p);
    const a = hubV.clone().normalize(), b = v.clone().normalize();
    const ang = a.angleTo(b), pts = [];
    for (let i = 0; i <= 48; i++) {
      const t = i / 48;
      const d = new THREE.Vector3().copy(a).multiplyScalar(Math.sin((1 - t) * ang) / Math.sin(ang)).add(b.clone().multiplyScalar(Math.sin(t * ang) / Math.sin(ang)));
      pts.push(d.multiplyScalar(R + 0.05 + Math.sin(Math.PI * t) * (0.35 + ang * 1.1)));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.045, 6), new THREE.MeshBasicMaterial({ color: C.sun, transparent: true }));
    tube.userData.curve = curve;
    tube.userData.count = tube.geometry.index.count;
    tube.geometry.setDrawRange(0, 0);
    globe.add(tube);
    arcs.push(tube);
  });
  const mini = makePlane();
  mini.scale.setScalar(0.16);
  globe.add(mini);
  {
    const n = 500, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = V3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(40 + Math.random() * 30);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    earth.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xfff4c8, size: 0.35, fog: false, transparent: true, opacity: 0.9 })));
  }

  /* ============ فصل 4: شنط وتذاكر ============ */
  const FZ = -220;
  const fin = new THREE.Group();
  fin.position.set(0, 0, FZ);
  scene.add(fin);
  function suitcase(col) {
    const g = new THREE.Group();
    g.add(part(new THREE.BoxGeometry(1.6, 2.1, 0.75), col));
    for (const x of [-0.45, 0.45]) g.add(part(new THREE.BoxGeometry(0.16, 2.12, 0.77), C.white, { pos: [x, 0, 0], line: 0 }));
    g.add(part(new THREE.TorusGeometry(0.3, 0.07, 8, 20, Math.PI), C.ink, { pos: [0, 1.05, 0], line: 0 }));
    for (const x of [-0.6, 0.6]) g.add(part(new THREE.SphereGeometry(0.13, 10, 8), C.ink, { pos: [x, -1.1, 0.2], line: 0 }));
    g.add(part(new THREE.CircleGeometry(0.28, 20), C.sun, { pos: [0.2, 0.4, 0.38], line: 0 }));
    return g;
  }
  function ticket(code) {
    const tex = canvasTex(512, 256, (g, w, h) => {
      g.fillStyle = "#ffc845"; g.fillRect(0, 0, w, h);
      g.fillStyle = "#1d1b2f"; g.fillRect(0, 0, w, 54);
      g.fillStyle = "#fff"; g.font = `800 30px ${FONT}`; g.textBaseline = "middle"; g.fillText("BOARDING PASS", 26, 28);
      g.fillStyle = "#1d1b2f"; g.font = `800 84px ${FONT}`; g.fillText("BGW", 26, 140); g.textAlign = "right"; g.fillText(code, w - 26, 140);
      g.textAlign = "center"; g.font = `60px ${FONT}`; g.fillText("✈", w / 2, 142);
      g.setLineDash([10, 10]); g.strokeStyle = "#1d1b2f"; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 200); g.lineTo(w, 200); g.stroke();
    });
    return part(new THREE.BoxGeometry(2, 1, 0.05), [toon(C.sun), toon(C.sun), toon(C.sun), toon(C.sun), new THREE.MeshToonMaterial({ map: tex, gradientMap: grad }), toon(C.sun)], { line: 0.04 });
  }
  const floaters = [
    [suitcase(C.coral), [-5.2, -0.6, 0], 0.4], [suitcase(C.sky), [5.4, 0.8, -1], -0.5], [suitcase(C.mint), [-3.4, 3.4, -3], 0.2],
    [ticket("IST"), [3.6, 3.2, 0.5], -0.3], [ticket("BKK"), [-6.2, 2.2, -2], 0.5], [ticket("CAI"), [6.4, -2.2, 0.2], 0.25], [ticket("BEY"), [-2.4, -3, 1], -0.4]
  ].map(([obj, p, r], i) => {
    obj.userData = { base: V3(...p), r, ph: i * 1.3 };
    fin.add(obj);
    return obj;
  });
  const confetti = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.08, 0.02), new THREE.MeshBasicMaterial(), 90);
  {
    const cols = [C.coral, C.sun, C.sky, C.mint, 0xb55cff].map((c) => new THREE.Color(c));
    for (let i = 0; i < 90; i++) {
      confetti.setColorAt(i, cols[i % cols.length]);
      confetti.userData[i] = { x: (Math.random() - 0.5) * 18, y: Math.random() * 12, z: (Math.random() - 0.5) * 6 - 1, s: 0.5 + Math.random(), r: Math.random() * 6 };
    }
  }
  fin.add(confetti);

  /* ============ مسار الطيارة ============ */
  const path = new THREE.CatmullRomCurve3([
    V3(0, 0.9, 0), V3(0, 1.5, -3.5), V3(0, 2.3, -8), V3(-0.6, 3.1, -16), V3(-3, 4.4, -28),
    V3(2.2, 5.4, -42), V3(0, 6.2, -56), V3(-1.2, 7.2, -72), V3(0, 9.5, -94)
  ]);
  const FOLLOW = V3(1.3, 1.1, 7.2);

  /* مواقع الكاميرا بكل فصل [p، مكان الكاميرا، وين تباوع] */
  const K = [
    [0.0, V3(0, 2.1, 15.5), V3(0, 1.3, 0)],
    [0.12, V3(5.2, 2.4, 10), V3(0, 1.2, -1)],
    null, /* .12 → .42 الكاميرا تلحق الطيارة */
    [0.42, null, null],
    [0.49, V3(0, 0.7, PZ + 11.5), V3(0, 0.2, PZ)],
    [0.63, V3(2.2, 1.4, PZ + 10.5), V3(0, 0.3, PZ)],
    [0.69, V3(0, 0.8, GZ + 15), V3(0, 0, GZ)],
    [0.87, V3(0, 0.4, GZ + 12.5), V3(0, 0, GZ)],
    [0.93, V3(0, 1.2, FZ + 15), V3(0, 0.6, FZ)],
    [1.0, V3(0, 2.2, FZ + 13), V3(0, 1, FZ)]
  ].filter(Boolean);
  const PATH_A = 0.13, PATH_B = 0.42;
  const pathS = (p) => seg(p, PATH_A, PATH_B);
  K[2][1] = path.getPoint(1).add(V3(FOLLOW.x - 6, FOLLOW.y + 0.6, FOLLOW.z - 1.2));
  K[2][2] = path.getPoint(1).add(V3(0, 0.2, -2));

  /* لون الخلفية حسب الفصل */
  const BG = [[0, C.cream], [0.1, C.cream], [0.2, C.sky], [0.42, C.sky], [0.47, C.dark], [0.64, C.dark], [0.69, C.night], [0.88, C.night], [0.92, C.cream], [1, C.cream]]
    .map(([p, c]) => [p, new THREE.Color(c)]);
  function bgAt(p, out) {
    for (let i = 1; i < BG.length; i++) if (p <= BG[i][0]) return out.copy(BG[i - 1][1]).lerp(BG[i][1], smooth(clamp((p - BG[i - 1][0]) / (BG[i][0] - BG[i - 1][0]))));
    return out.copy(BG[BG.length - 1][1]);
  }

  /* الفصول: [يبدا، ينتهي] بنسبة النزول */
  const CH = [[-1, 0.1], [0.23, 0.38], [0.48, 0.63], [0.68, 0.87], [0.91, 2]];
  const RTL = () => document.documentElement.dir === "rtl";
  /* وين يكون الشي اللي بالمشهد: عكس جهة الكتابة (1 = يمين، -1 = يسار) */
  const SIDE = [-1, 1, -1, 1, 0];

  const camPos = V3(), camLook = V3(), tmpA = V3(), tmpB = V3();
  const qIdle = new THREE.Quaternion(), qPath = new THREE.Quaternion(), m4 = new THREE.Matrix4();
  let W = 1, H = 1, portrait = false;

  function resize() {
    W = stage.clientWidth; H = stage.clientHeight;
    portrait = W / H < 0.85;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, portrait ? 1.6 : 1.8));
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.fov = portrait ? 62 : 40;
    camera.updateProjectionMatrix();
  }
  addEventListener("resize", resize);
  resize();

  /* ============ الحالة بكل نسبة p ============ */
  let pT = 0, pS = 0, time = 0, last = performance.now(), curStop = -1, glFrom = 0;
  const globeRot = { x: 0, y: 0 };

  function readScroll() {
    const r = document.getElementById("journey").getBoundingClientRect();
    pT = clamp(-r.top / (r.height - innerHeight));
    return r;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const r = readScroll();
    if (r.bottom < -50 || r.top > innerHeight + 50) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    pS = RM ? pT : pS + (pT - pS) * Math.min(1, dt * 5);
    const p = pS;

    /* ---- الخلفية والضباب والإضاءة ---- */
    bgAt(p, bg);
    scene.fog.color.copy(bg);
    const darkK = seg(p, 0.43, 0.48) * (1 - seg(p, 0.88, 0.92));
    hemi.intensity = lerp(2.2, 0.55, darkK);
    sunLight.intensity = lerp(2.4, 0.9, darkK);
    spot.intensity = 260 * seg(p, 0.44, 0.5) * (1 - seg(p, 0.64, 0.68));
    stage.classList.toggle("is-dark", darkK > 0.5);

    /* ---- مين يبين ---- */
    room.visible = p < 0.3;
    backdrop.visible = p < 0.3;
    sky.visible = p < 0.5;
    visa.visible = p > 0.38 && p < 0.7;
    earth.visible = p > 0.6 && p < 0.92;
    fin.visible = p > 0.84;

    /* ---- الطيارة ---- */
    const s = pathS(p);
    if (p < 0.9) {
      plane.visible = p < PATH_B + 0.02;
      const bob = Math.sin(time * 1.6) * 0.12 * (1 - seg(p, PATH_A, PATH_A + 0.03));
      const sd = Math.min(s, 0.99);
      path.getPoint(s, tmpA);
      plane.position.copy(tmpA).y += bob;
      path.getPoint(sd, tmpA);
      qIdle.setFromEuler(new THREE.Euler(Math.sin(time * 1.2) * 0.04, Math.PI / 2 + 0.5 + Math.sin(time * 0.7) * 0.12 - p * 4, Math.sin(time * 1.6) * 0.05));
      path.getPoint(sd + 0.01, tmpB);
      m4.lookAt(tmpB, tmpA, up);
      qPath.setFromRotationMatrix(m4);
      const tan1 = path.getTangent(Math.max(0, s - 0.02)), tan2 = path.getTangent(Math.min(1, s + 0.02));
      const bank = clamp((tan2.x - tan1.x) * -14, -0.7, 0.7);
      qPath.multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 0, 1), bank));
      plane.quaternion.slerpQuaternions(qIdle, qPath, seg(p, PATH_A - 0.02, PATH_A + 0.04));
    } else {
      /* الطيارة ترجع بالنهاية وتلف حول الشنط */
      plane.visible = true;
      const a = time * 0.6;
      plane.position.set(Math.cos(a) * 7.5, 4.2 + Math.sin(a * 2) * 0.6, FZ + Math.sin(a) * 3.5);
      plane.lookAt(Math.cos(a + 0.1) * 7.5, 4.2 + Math.sin((a + 0.1) * 2) * 0.6, FZ + Math.sin(a + 0.1) * 3.5);
      plane.rotateZ(-0.35);
    }
    plane.scale.setScalar(p < 0.9 ? 1 : 0.7);

    /* ---- الغيوم تتمايل ---- */
    if (sky.visible) clouds.forEach((c) => { c.position.x += Math.sin(time * 0.3 + c.userData.drift) * 0.002; c.position.y += Math.cos(time * 0.4 + c.userData.drift) * 0.0015; });

    /* ---- الجواز ---- */
    if (visa.visible) {
      const k = seg(p, 0.47, 0.58);
      coverPivot.rotation.y = -k * 2.55;
      passport.position.x = k * PW * 0.5;
      passport.rotation.y = lerp(0.7, -0.15, seg(p, 0.44, 0.56)) + Math.sin(time * 0.6) * 0.08;
      passport.rotation.x = Math.sin(time * 0.8) * 0.05 - 0.08;
      passport.position.y = 0.4 + Math.sin(time * 1.1) * 0.1;
      const pop = seg(p, 0.5, 0.58);
      stamps.forEach((h, i) => {
        const u = h.userData, a = u.a + time * 0.35 + p * 6;
        h.position.set(passport.position.x - 0.5 + Math.cos(a) * u.r * 0.85, u.y + Math.sin(time + i) * 0.15, Math.sin(a) * u.r * 0.7);
        h.rotation.set(Math.sin(time * u.spin) * 0.25, Math.sin(time * u.spin * 0.8 + i) * 0.6, Math.sin(time * 0.5 + i) * 0.3);
        h.scale.setScalar(Math.max(0.001, smooth(clamp(pop * 1.4 - i * 0.05))));
      });
    }

    /* ---- الكرة الأرضية ---- */
    if (earth.visible) {
      const q = seg(p, 0.69, 0.86) * 0.9999;
      const n = STOPS.length, x = q * n, i = Math.min(n - 1, Math.floor(x)), f = clamp((x - i) / 0.65);
      if (i !== curStop) { curStop = i; APP.showDest(i); glFrom = time; }
      /* لف الكرة حتى يبين النص بين بغداد والوجهة */
      const st = STOPS[i], mid = ll2v((BGW[0] + st.ll[0]) / 2, (BGW[1] + st.ll[1]) / 2);
      let ty = -Math.atan2(mid.x, mid.z), tx = Math.asin(clamp(mid.y / R, -1, 1)) * 0.7;
      let dy = ty - globeRot.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const k = RM ? 1 : Math.min(1, dt * 3);
      globeRot.y += dy * k; globeRot.x += (tx - globeRot.x) * k;
      globe.rotation.set(globeRot.x, globeRot.y + Math.sin(time * 0.3) * 0.03, 0);
      earth.rotation.y = 0;
      arcs.forEach((a, j) => {
        const d = j < i ? 1 : j === i ? f : 0;
        a.geometry.setDrawRange(0, Math.floor((a.userData.count * d) / 6) * 6);
        a.material.opacity = j === i ? 1 : 0.45;
        a.material.color.setHex(j === i ? C.sun : 0xffffff);
      });
      pins.forEach((pn, j) => {
        const on = j === i && f > 0.95;
        const tgt = j < i ? 0.8 : j === i ? (on ? 1.35 + Math.sin(time * 5) * 0.08 : 0.8) : 0.55;
        pn.scale.setScalar(lerp(pn.scale.x || 0.5, tgt, Math.min(1, dt * 8)));
      });
      const cur = arcs[i].userData.curve;
      mini.visible = f > 0.02 && f < 0.99;
      cur.getPoint(Math.min(0.999, f), tmpA);
      cur.getPoint(Math.min(1, f + 0.01), tmpB);
      mini.position.copy(tmpA);
      mini.lookAt(globe.localToWorld(tmpB.clone()));
      ring.rotation.z = time * 0.1;
    }

    /* ---- الشنط ---- */
    if (fin.visible) {
      const spread = 1 + seg(p, 0.93, 1) * 0.25;
      floaters.forEach((o) => {
        const u = o.userData;
        o.position.copy(u.base).multiplyScalar(spread);
        o.position.y += Math.sin(time * 1.2 + u.ph) * 0.3;
        o.rotation.set(Math.sin(time * 0.7 + u.ph) * 0.25, u.r + Math.sin(time * 0.5 + u.ph) * 0.5, Math.sin(time * 0.9 + u.ph) * 0.15);
      });
      const d = new THREE.Object3D();
      for (let j = 0; j < 90; j++) {
        const c = confetti.userData[j];
        d.position.set(c.x + Math.sin(time + j) * 0.4, ((c.y - time * c.s) % 12 + 12) % 12 - 4, c.z);
        d.rotation.set(time * c.s * 2 + c.r, time * c.s + c.r, c.r);
        d.updateMatrix();
        confetti.setMatrixAt(j, d.matrix);
      }
      confetti.instanceMatrix.needsUpdate = true;
    }

    /* ---- الكاميرا ---- */
    if (p >= K[1][0] && p <= PATH_B) {
      const side = seg(s, 0.22, 0.4);
      const fpos = path.getPoint(s).add(tmpB.set(FOLLOW.x - side * 6, FOLLOW.y + side * 0.6, FOLLOW.z - side * 1.2)), flook = path.getPoint(s).add(V3(0, 0.2, -4 + side * 2));
      const w = seg(p, K[1][0], K[1][0] + 0.07);
      camPos.copy(K[1][1]).lerp(fpos, w);
      camLook.copy(K[1][2]).lerp(flook, w);
    } else {
      let a = K[0], b = K[K.length - 1];
      for (let j = 1; j < K.length; j++) if (p <= K[j][0]) { a = K[j - 1]; b = K[j]; break; }
      const k = smooth(clamp((p - a[0]) / Math.max(1e-4, b[0] - a[0])));
      camPos.copy(a[1]).lerp(b[1], k);
      camLook.copy(a[2]).lerp(b[2], k);
    }
    if (portrait) camPos.add(tmpA.copy(camPos).sub(camLook).multiplyScalar(0.18));
    camera.position.copy(camPos);
    camera.lookAt(camLook);

    /* المشهد يروح عكس جهة النص (بالموبايل النص فوك والمشهد جوه) */
    let off = 0, offY = 0;
    for (let j = 0; j < CH.length; j++) {
      const mid = clamp((CH[j][0] + CH[j][1]) / 2, 0, 1), w = 1 - clamp(Math.abs(p - mid) / 0.16);
      off += SIDE[j] * w;
      offY += (j === 3 || j === 4 ? 0.12 : -0.13) * w;
    }
    if (portrait) camera.setViewOffset(W, H, 0, offY * H, W, H);
    else camera.setViewOffset(W, H, -off * (RTL() ? 1 : -1) * W * 0.2, 0, W, H);

    /* ---- النصوص ---- */
    CH.forEach(([a, b], j) => {
      const o = Math.min(seg(p, a - 0.03, a), 1 - seg(p, b, b + 0.03));
      const el = chEls[j];
      el.style.opacity = o.toFixed(3);
      el.classList.toggle("on", o > 0.02);
      el.firstElementChild.style.transform = `translateY(${((1 - o) * 24).toFixed(1)}px)`;
    });
    document.getElementById("cue").style.opacity = p > 0.02 ? 0 : 1;
    dots.forEach((d, j) => d.classList.toggle("on", p >= (CH[j][0] < 0 ? 0 : CH[j][0] - 0.04) && (j === 4 || p < CH[j + 1][0] - 0.04)));

    renderer.render(scene, camera);
    if (!loaded) { loaded = true; document.getElementById("loading").classList.add("gone"); }
  }

  /* أزرار الفصول على الجنب */
  const prog = document.getElementById("progress");
  const dots = CH.map((c, j) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-label", String(j + 1));
    b.addEventListener("click", () => {
      const jr = document.getElementById("journey");
      const mid = j === 0 ? 0 : j === 4 ? 0.97 : (c[0] + c[1]) / 2;
      scrollTo({ top: jr.offsetTop + (jr.offsetHeight - innerHeight) * mid, behavior: RM ? "auto" : "smooth" });
    });
    prog.appendChild(b);
    return b;
  });

  let loaded = false;
  readScroll();
  pS = pT;
  requestAnimationFrame(frame);
}
