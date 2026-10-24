// The LawApp logo as a real 3D object, built from the hand sketch:
// a chat bubble with a dark "lid" band on top, two eyes, a smile and the big "L" in the front.
// Drag to turn it. Without WebGL the flat SVG logo simply stays.
import * as THREE from './three.module.min.js';

const INK = 0x3a56f0, DEEP = 0x1a2894, PAPER = 0xffffff, DARK = 0x0e1020;

function bubble() {
  const w = 2.1, hh = 1.7, r = .78, s = new THREE.Shape();
  s.moveTo(-w + r, hh); s.lineTo(w - r, hh); s.quadraticCurveTo(w, hh, w, hh - r); s.lineTo(w, -hh + r); s.quadraticCurveTo(w, -hh, w - r, -hh);
  s.lineTo(-.15, -hh); s.lineTo(-1.35, -hh - .95); s.lineTo(-1.45, -hh); s.lineTo(-w + r, -hh); s.quadraticCurveTo(-w, -hh, -w, -hh + r);
  s.lineTo(-w, hh - r); s.quadraticCurveTo(-w, hh, -w + r, hh); return s;
}
function lid() {
  const w = 2.1 + .07, top = 1.7 + .07, r = .85, s = new THREE.Shape();
  s.moveTo(-w, .95); s.lineTo(-w, top - r); s.quadraticCurveTo(-w, top, -w + r, top); s.lineTo(w - r, top); s.quadraticCurveTo(w, top, w, top - r); s.lineTo(w, .95); s.lineTo(-w, .95); return s;
}
function letterL() {
  const s = new THREE.Shape();
  [[-1.2, .95], [-.7, .95], [-.7, -.3], [1.0, -.3], [1.0, -.85], [-1.2, -.85]].forEach(([x, y], i) => i ? s.lineTo(x, y) : s.moveTo(x, y)); s.closePath(); return s;
}
function extrude(shape, depth, bevel, color, rough = .38) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 6, curveSegments: 28 });
  g.translate(0, 0, -depth / 2);
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: .06 }));
}

export function mountLogo3D(box) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }); } catch { return () => {}; }
  const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(32, 1, .1, 50), root = new THREE.Group(), face = new THREE.Group();
  cam.position.set(0, .1, 10.8);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;

  const body = extrude(bubble(), .9, .2, INK, .32), band = extrude(lid(), 1.14, .12, DEEP, .45), L = extrude(letterL(), .22, .06, PAPER, .5);
  L.position.set(-.3, -.12, .55 + .11); band.position.z = 0; body.position.z = 0;
  const eyeGeo = new THREE.SphereGeometry(.4, 32, 24), eyeMat = new THREE.MeshStandardMaterial({ color: DARK, roughness: .15, metalness: .2 });
  const glint = new THREE.MeshBasicMaterial({ color: 0xffffff }), eyes = [];
  [.3, 1.25].forEach(x => {
    const e = new THREE.Group(), ball = new THREE.Mesh(eyeGeo, eyeMat), g = new THREE.Mesh(new THREE.SphereGeometry(.085, 12, 10), glint);
    ball.scale.set(1, 1.22, .6); g.position.set(.12, .2, .22); e.add(ball, g); e.position.set(x, .42, .6); face.add(e); eyes.push(e);
  });
  const smile = new THREE.Mesh(new THREE.TorusGeometry(.34, .07, 12, 32, Math.PI), new THREE.MeshStandardMaterial({ color: PAPER, roughness: .5 }));
  smile.rotation.z = Math.PI; smile.position.set(.78, -.02, .6); face.add(smile);
  root.add(body, band, L, face); root.position.y = .35; scene.add(root);

  scene.add(new THREE.HemisphereLight(0xe8ecff, 0x2a3480, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(3, 5, 7); scene.add(key);
  const rim = new THREE.DirectionalLight(0x7f95ff, 1.4); rim.position.set(-6, -2, -4); scene.add(rim);

  const cv = renderer.domElement; cv.className = 'l3d-cv'; cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', 'LawApp logosu (3D)');
  box.replaceChildren(cv);
  const size = () => { const w = box.clientWidth || 240, h = box.clientHeight || 220; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
  size(); const ro = new ResizeObserver(size); ro.observe(box);

  // drag to turn; it eases back to a gentle sway when let go
  let ry = reduce ? -.35 : 0, rx = 0, ty = -.35, tx = 0, drag = null, idleAt = 0, t0 = performance.now(), blink = 0, nextBlink = t0 + 5000, px = 0, py = 0, alive = true;
  cv.style.touchAction = 'pan-y'; cv.style.cursor = 'grab';
  cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, ty, tx }; cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing'; });
  cv.addEventListener('pointermove', e => {
    const r = cv.getBoundingClientRect(); px = (e.clientX - r.left) / r.width * 2 - 1; py = (e.clientY - r.top) / r.height * 2 - 1;
    if (drag) { ty = drag.ty + (e.clientX - drag.x) * .012; tx = Math.max(-.7, Math.min(.7, drag.tx + (e.clientY - drag.y) * .01)); }
  });
  const up = () => { drag = null; idleAt = performance.now(); cv.style.cursor = 'grab'; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('pointerleave', () => { px = py = 0; });

  const tick = now => {
    if (!alive) return;
    if (!cv.isConnected) return dispose();   // the screen changed: stop and free the GPU
    if (!document.hidden) {
      const t = (now - t0) / 1000;
      if (!drag && !reduce && now - idleAt > 1800) { ty += (Math.sin(t * .7) * .5 - .35 - ty) * .02; tx += (Math.sin(t * .5) * .08 - tx) * .03; }
      ry += (ty - ry) * .12; rx += (tx - rx) * .12;
      root.rotation.set(rx, ry, 0); if (!reduce) root.position.y = .35 + Math.sin(t * 1.3) * .07;
      eyes.forEach(e => { e.position.x += (((e === eyes[0] ? .3 : 1.25) + px * .09) - e.position.x) * .15; e.position.y += ((.42 - py * .07) - e.position.y) * .15; });
      if (now > nextBlink) { blink = now; nextBlink = now + 2500 + Math.random() * 3000; }
      const b = blink ? Math.max(.08, Math.abs((now - blink) / 140 - 1)) : 1; if (blink && now - blink > 280) blink = 0;
      eyes.forEach(e => { e.scale.y = blink ? b : 1; });
      renderer.render(scene, cam);
    }
    raf = requestAnimationFrame(tick);
  };
  let raf = requestAnimationFrame(tick);
  function dispose() {
    alive = false; cancelAnimationFrame(raf); ro.disconnect();
    scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    renderer.dispose(); renderer.forceContextLoss();
  }
  return dispose;
}
