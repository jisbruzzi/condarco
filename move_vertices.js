#!/usr/bin/env node
/*
 * move_vertices.js — shift axis-aligned vertex planes in floorplan.obj
 *
 * Companion to remove_vertices.js. While that script deletes vertices, this one
 * *moves* them: it shifts every vertex lying on an axis-aligned plane
 * (x = const or y = const, within --tol) to a new coordinate. Moving the whole
 * plane — base (z = 0) and ceiling (z = 2.7) vertices together — keeps every
 * wall box rectangular, so all wall angles stay at 90° (walls keep either
 * constant X or constant Y).
 *
 * Typical uses: close a gap between two collinear wall boxes by extending one
 * box's end plane onto the other's, or snap two corner vertices onto the same
 * X / Y so they form a clean L corner.
 *
 * Usage:
 *   node move_vertices.js --plane x 1.6717 1.7037 --bbox 1.6,1.8,5.5,8.5 --plane y -3.6993 -3.6564
 *   node move_vertices.js --plane x -0.0652 0.3035   # single move
 *   node move_vertices.js --audit                    # check only, no write
 *
 * Options:
 *   --plane <x|y> <from> <to>   move plane <axis>=<from> to <to> (repeatable)
 *   --bbox <x0,x1,y0,y1>        attach to the PRECEDING --plane to restrict it
 *                               to this footprint rectangle (vertices with
 *                               z = any height still move, so base + ceiling
 *                               stay in sync)
 *   --tol <m>                   plane-matching tolerance (default 0.0005)
 *   --dry-run                   report what would move without writing
 *   --audit                     list faces with non-axis-aligned edges and exit
 *   --out <path>                write elsewhere (default: floorplan.obj in place)
 *
 * Coordinates are written with 4 decimals, matching the file's style.
 * Moving a plane onto an existing plane leaves coincident (duplicate-coordinate)
 * vertices behind — harmless; the whole model is already built that way.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DEFAULT_OBJ = path.join(__dirname, 'floorplan.obj');

function parseArgs(argv) {
  const opts = { planes: [], tol: 0.0005, dryRun: false, audit: false, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--plane') {
      const axis = argv[++i];
      if (axis !== 'x' && axis !== 'y') { console.error('--plane necesita eje x|y'); process.exit(2); }
      opts.planes.push({ axis, from: parseFloat(argv[++i]), to: parseFloat(argv[++i]), bbox: null });
    }
    else if (a === '--bbox') {
      const n = argv[++i].split(',').map(Number);
      if (n.length !== 4 || n.some(Number.isNaN)) { console.error('--bbox necesita x0,x1,y0,y1'); process.exit(2); }
      if (!opts.planes.length) { console.error('--bbox debe seguir a un --plane'); process.exit(2); }
      opts.planes[opts.planes.length - 1].bbox = n;
    }
    else if (a === '--tol') opts.tol = parseFloat(argv[++i]);
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--audit') opts.audit = true;
    else if (a === '--out') opts.out = argv[++i];
    else { console.error('argumento no reconocido: ' + a); process.exit(2); }
  }
  return opts;
}

function load(OBJ) {
  const lines = fs.readFileSync(OBJ, 'utf8').split('\n');
  const V = [null]; // 1-based: {x,y,z}
  for (const line of lines) {
    const t = line.trim();
    if (t[0] === 'v' && (t[1] === ' ' || t[1] === '\t')) {
      const p = t.split(/\s+/);
      V.push({ x: +p[1], y: +p[2], z: +p[3] });
    }
  }
  const faces = []; // {idx:[1-based...]}
  let section = null;
  for (const line of lines) {
    const t = line.trim();
    if (t[0] === 'o' && (t[1] === ' ' || t[1] === '\t')) section = t.slice(2).trim();
    else if (t[0] === 'f' && (t[1] === ' ' || t[1] === '\t')) {
      faces.push({ section, idx: t.split(/\s+/).slice(1).map((s) => parseInt(s.split('/')[0], 10)) });
    }
  }
  return { lines, V, faces };
}

// Every edge of every face must run along one axis (dx, dy or dz ≈ 0).
function audit(V, faces, tol) {
  const bad = [];
  for (const f of faces) {
    for (let k = 0; k < f.idx.length; k++) {
      const a = V[f.idx[k]], b = V[f.idx[(k + 1) % f.idx.length]];
      const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y), dz = Math.abs(a.z - b.z);
      const axis = (dx <= tol ? 1 : 0) + (dy <= tol ? 1 : 0) + (dz <= tol ? 1 : 0);
      if (axis < 2) bad.push({ face: f, a: f.idx[k], b: f.idx[(k + 1) % f.idx.length] });
    }
  }
  return bad;
}

const opts = parseArgs(process.argv.slice(2));
const OBJ = opts.out ? path.resolve(opts.out) : DEFAULT_OBJ;
const { lines, V, faces } = load(OBJ);
const N = V.length - 1;

if (opts.audit || (!opts.planes.length && !opts.dryRun)) {
  const bad = audit(V, faces, 1e-6);
  console.log('vértices: ' + N + ', caras: ' + faces.length);
  if (!bad.length) console.log('audit: todas las aristas son paralelas a un eje (90° OK)');
  else {
    console.log('audit: ' + bad.length + ' aristas NO alineadas a ejes:');
    for (const e of bad.slice(0, 20)) {
      const a = V[e.a], b = V[e.b];
      console.log('  ' + e.face.section + ' v' + e.a + ' (' + a.x + ',' + a.y + ',' + a.z +
        ') — v' + e.b + ' (' + b.x + ',' + b.y + ',' + b.z + ')');
    }
  }
  if (!opts.planes.length) process.exit(bad.length ? 1 : 0);
}

if (!opts.planes.length) { console.error('sin --plane nada que mover.'); process.exit(2); }

const inBbox = (v, bb) => !bb ||
  (v.x >= bb[0] && v.x <= bb[1] && v.y >= bb[2] && v.y <= bb[3]);

// Apply sequentially so a later op sees earlier moves.
for (const op of opts.planes) {
  const hit = [];
  for (let i = 1; i <= N; i++) {
    const c = op.axis === 'x' ? V[i].x : V[i].y;
    if (Math.abs(c - op.from) <= opts.tol && inBbox(V[i], op.bbox)) hit.push(i);
  }
  console.log('plano ' + op.axis + '=' + op.from + ' -> ' + op.to + ': ' + hit.length + ' vértices' +
    (hit.length ? ' (v' + hit.join(', v') + ')' : '  <-- ¡NINGUNO, revisá el valor/tolerancia!'));
  for (const i of hit) {
    if (op.axis === 'x') V[i].x = op.to; else V[i].y = op.to;
  }
}

const bad = audit(V, faces, 1e-6);
if (bad.length) {
  console.log('ADVERTENCIA: ' + bad.length + ' aristas quedaron no alineadas a ejes (ver --audit).');
} else {
  console.log('todas las aristas siguen paralelas a un eje (90° OK).');
}

if (opts.dryRun) { console.log('(--dry-run: no se escribió nada)'); process.exit(0); }

// Rewrite vertex lines in order (face indices unchanged — no add/remove).
let vi = 0;
const out = lines.map((line) => {
  const t = line.trim();
  if (t[0] === 'v' && (t[1] === ' ' || t[1] === '\t')) {
    vi++;
    const v = V[vi];
    return 'v ' + v.x.toFixed(4) + ' ' + v.y.toFixed(4) + ' ' + v.z.toFixed(4);
  }
  return line;
});
fs.writeFileSync(OBJ, out.join('\n'));
console.log('escrito: ' + path.relative(process.cwd(), OBJ));
