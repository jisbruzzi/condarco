#!/usr/bin/env node
/*
 * clean_walls.js — rebuild the `walls` section of floorplan.obj from its
 * footprint rectangles, removing overlapping / duplicated wall boxes.
 *
 * Problem: the walls were generated as one box per detected wall strip, and
 * the strips overlap heavily (junction extensions, doubled linework, parallel
 * runs). Hundreds of boxes intersect volumetrically, so inner faces hide
 * corners and the Ctrl+D tool can never highlight the real corner vertices.
 *
 * What it does:
 *   1. Parses every valid `walls` box (6 faces, 8 verts, axis-aligned) into a
 *      footprint rectangle (x0,x1,y0,y1). Drops the ~18 scrap faces that never
 *      formed a box (orphan side/bottom/top quads from earlier deletions).
 *   2. Splits each footprint at every other footprint's edges that cross it,
 *      producing fragments whose interiors never cross a wall boundary.
 *   3. Keeps a fragment iff its centre is NOT strictly inside another box's
 *      footprint (removes the "box inside box" doubles; junction overlaps go
 *      away because the union is re-emitted as disjoint fragments).
 *   4. Merges fragments back into maximal rectangles along shared full edges
 *      (keeps the file small and corners clean), drops degenerate slivers
 *      (< --minw, default 1 cm), and writes each rectangle as a fresh box
 *      (z 0 → 2.7), reusing move_vertices.js-style 4-decimal formatting.
 *   5. Leaves every other section (floor, ceilings, block_*) untouched, prunes
 *      now-unused vertices, renumbers faces, refreshes the header count.
 *
 * Every emitted wall is still axis-aligned (constant X or constant Y), so the
 * 90° invariant holds; verify with `node move_vertices.js --audit`.
 *
 * Usage:
 *   node clean_walls.js                 # rewrite floorplan.obj in place
 *   node clean_walls.js --dry-run       # report only
 *   node clean_walls.js --out clean.obj # write elsewhere
 *   node clean_walls.js --minw 0.02     # drop fragments thinner than 2 cm
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DEFAULT_OBJ = path.join(__dirname, 'floorplan.obj');
const Z0 = 0, Z1 = 2.7;

function parseArgs(argv) {
  const opts = { dryRun: false, out: null, minw: 0.01 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--minw') opts.minw = parseFloat(argv[++i]);
    else { console.error('argumento no reconocido: ' + a); process.exit(2); }
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
const OBJ = DEFAULT_OBJ; // always read the real model…
const OUT = opts.out ? path.resolve(opts.out) : DEFAULT_OBJ; // …write elsewhere with --out
const t0 = Date.now();
const log = (m) => console.log(m + '  [' + (Date.now() - t0) + 'ms]');
const lines = fs.readFileSync(OBJ, 'utf8').split('\n');
log('leídas ' + lines.length + ' líneas');

// ---- 1. parse vertices + sections ---------------------------------------
const V = [null]; // 1-based {x,y,z}
for (const line of lines) {
  const t = line.trim();
  if (t[0] === 'v' && (t[1] === ' ' || t[1] === '\t')) {
    const p = t.split(/\s+/);
    V.push({ x: +p[1], y: +p[2], z: +p[3] });
  }
}
const sections = []; // {name, faces:[[1-based]]}
{
  let cur = null;
  for (const line of lines) {
    const t = line.trim();
    if (t[0] === 'o' && (t[1] === ' ' || t[1] === '\t')) { cur = { name: t.slice(2).trim(), faces: [] }; sections.push(cur); }
    else if (t[0] === 'f' && (t[1] === ' ' || t[1] === '\t')) {
      if (!cur) { cur = { name: 'object', faces: [] }; sections.push(cur); }
      cur.faces.push(t.split(/\s+/).slice(1).map((s) => parseInt(s.split('/')[0], 10)));
    }
  }
}
const walls = sections.find((s) => s.name === 'walls');
if (!walls) { console.error('sección walls no encontrada'); process.exit(2); }

// ---- 2. valid boxes -> footprint rectangles ------------------------------
// Faces linked by shared vertices; a valid wall box = 6 faces / 8 verts /
// 2 distinct x / 2 distinct y / 2 distinct z.
const parent = new Map();
const find = (a) => {
  let r = a;
  while (parent.get(r) !== r) r = parent.get(r);
  parent.set(a, r); // path halving (single step is enough here)
  return r;
};
walls.faces.forEach((f, i) => parent.set(i, i));
const byVert = new Map();
walls.faces.forEach((f, i) => f.forEach((v) => {
  if (!byVert.has(v)) byVert.set(v, []);
  byVert.get(v).push(i);
}));
for (const lst of byVert.values()) for (let k = 1; k < lst.length; k++) {
  const a = find(lst[0]), b = find(lst[k]);
  if (a !== b) parent.set(b, a);
}
const comps = new Map();
walls.faces.forEach((f, i) => {
  const r = find(i);
  if (!comps.has(r)) comps.set(r, []);
  comps.get(r).push(f);
});

const rects = [];
let scrapFaces = 0;
for (const faces of comps.values()) {
  const ids = new Set();
  faces.forEach((f) => f.forEach((v) => ids.add(v)));
  const vs = [...ids].map((i) => V[i]);
  const xs = new Set(vs.map((v) => v.x.toFixed(4)));
  const ys = new Set(vs.map((v) => v.y.toFixed(4)));
  const zs = new Set(vs.map((v) => v.z.toFixed(4)));
  if (faces.length === 6 && ids.size === 8 && xs.size === 2 && ys.size === 2 && zs.size === 2) {
    const [x0, x1] = [...xs].map(Number).sort((a, b) => a - b);
    const [y0, y1] = [...ys].map(Number).sort((a, b) => a - b);
    rects.push({ x0, x1, y0, y1 });
  } else {
    scrapFaces += faces.length;
  }
}
console.log('cajas válidas: ' + rects.length + ' | caras scrap eliminadas: ' + scrapFaces);

// ---- 3. fragment at crossing edges ---------------------------------------
const key = (f) => f.x0.toFixed(4) + ',' + f.x1.toFixed(4) + ',' + f.y0.toFixed(4) + ',' + f.y1.toFixed(4);
const EPS = 1e-9;
const cutX = new Set(), cutY = new Set();
for (const r of rects) { cutX.add(r.x0); cutX.add(r.x1); cutY.add(r.y0); cutY.add(r.y1); }
// Only cuts that actually pass through a rect's interior split it; collect
// per-rect below.
let frags = [];
for (const r of rects) {
  const xs = [...cutX].filter((x) => x > r.x0 + EPS && x < r.x1 - EPS).sort((a, b) => a - b);
  const ys = [...cutY].filter((y) => y > r.y0 + EPS && y < r.y1 - EPS).sort((a, b) => a - b);
  const X = [r.x0, ...xs, r.x1], Y = [r.y0, ...ys, r.y1];
  for (let i = 0; i < X.length - 1; i++) for (let j = 0; j < Y.length - 1; j++) {
    frags.push({ x0: X[i], x1: X[i + 1], y0: Y[j], y1: Y[j + 1] });
  }
}
console.log('fragmentos: ' + frags.length);

// ---- 4. keep fragments covered by exactly one box -------------------------
// A fragment survives iff its centre is inside at least one input rect — but
// each DISTINCT covered area is emitted only once. Dedupe by rectangle key:
// two fragments from different boxes covering the same cell collapse into one.
// (Fragments fully outside every rect are the "outside" cells — dropped.)
const seenFrag = new Set();
const kept = [];
for (const f of frags) {
  const cx = (f.x0 + f.x1) / 2, cy = (f.y0 + f.y1) / 2;
  let inside = false;
  for (const r of rects) {
    if (cx > r.x0 + EPS && cx < r.x1 - EPS && cy > r.y0 + EPS && cy < r.y1 - EPS) {
      inside = true;
      break;
    }
  }
  if (!inside) continue;
  const k = key(f);
  if (!seenFrag.has(k)) { seenFrag.add(k); kept.push(f); }
}
log('fragmentos únicos (unión disjunta): ' + kept.length);

// ---- 5. merge back into maximal rectangles --------------------------------
function mergePass(list, horiz) {
  // Group by the shared full edge: horizontal merge needs same y0/y1 and
  // adjacent x; vertical merge needs same x0/x1 and adjacent y.
  const groups = new Map();
  for (const f of list) {
    const g = horiz ? f.y0.toFixed(4) + '|' + f.y1.toFixed(4) : f.x0.toFixed(4) + '|' + f.x1.toFixed(4);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(f);
  }
  const out = [];
  for (const g of groups.values()) {
    g.sort((a, b) => horiz ? a.x0 - b.x0 : a.y0 - b.y0);
    let cur = g[0];
    for (let i = 1; i < g.length; i++) {
      const n = g[i];
      const abuts = horiz
        ? Math.abs(n.x0 - cur.x1) < EPS
        : Math.abs(n.y0 - cur.y1) < EPS;
      if (abuts) {
        if (horiz) cur = { x0: cur.x0, x1: n.x1, y0: cur.y0, y1: cur.y1 };
        else cur = { x0: cur.x0, x1: cur.x1, y0: cur.y0, y1: n.y1 };
      } else { out.push(cur); cur = n; }
    }
    out.push(cur);
  }
  return out;
}
let merged = kept;
let prev = -1;
while (merged.length !== prev) { // alternate until stable
  prev = merged.length;
  merged = mergePass(mergePass(merged, true), false);
}
// Drop degenerate slivers (rounding dust), keep real thin walls (≥4 cm glazing).
merged = merged.filter((f) => (f.x1 - f.x0) >= opts.minw && (f.y1 - f.y0) >= opts.minw);
console.log('rectángulos finales: ' + merged.length);

// ---- 6. rebuild ------------------------------------------------------------
const nWallVerts = merged.length * 8;
const nWallFaces = merged.length * 6;
console.log('walls: ' + rects.length + ' cajas solapadas -> ' + merged.length +
  ' cajas disjuntas (' + nWallVerts + ' verts, ' + nWallFaces + ' caras)');

// New vertex table: keep every non-wall vertex, append fresh wall boxes.
// NOTE: indices MUST be assigned in the same order the surviving `v` lines are
// emitted below (ascending old index), otherwise faces get remapped against a
// different numbering and the kept sections skew.
const usedElsewhere = new Set();
for (const s of sections) {
  if (s.name === 'walls') continue;
  for (const f of s.faces) for (const i of f) usedElsewhere.add(i);
}
const newIndex = new Array(V.length).fill(0);
let nv = 0;
for (let i = 1; i <= V.length - 1; i++) {
  if (usedElsewhere.has(i)) newIndex[i] = ++nv;
}
const wallBase = nv;
nv += nWallVerts;

const fmt = (n) => n.toFixed(4);
const wallVerts = []; // {x,y,z} in file order
const wallFaces = []; // [1-based new indices]
for (const r of merged) {
  const b = wallVerts.length;
  wallVerts.push(
    { x: r.x0, y: r.y0, z: Z0 }, { x: r.x1, y: r.y0, z: Z0 },
    { x: r.x1, y: r.y1, z: Z0 }, { x: r.x0, y: r.y1, z: Z0 },
    { x: r.x0, y: r.y0, z: Z1 }, { x: r.x1, y: r.y0, z: Z1 },
    { x: r.x1, y: r.y1, z: Z1 }, { x: r.x0, y: r.y1, z: Z1 },
  );
  const W = (k) => wallBase + b + k; // 1-based new index of k-th (0-based) vert
  wallFaces.push(
    [W(1), W(2), W(3), W(4)], // bottom (z=0), kept for solidity like the original
    [W(5), W(8), W(7), W(6)], // top (z=2.7)
    [W(1), W(5), W(6), W(2)], // sides…
    [W(2), W(6), W(7), W(3)],
    [W(3), W(7), W(8), W(4)],
    [W(4), W(8), W(5), W(1)],
  );
}

if (opts.dryRun) { console.log('(--dry-run: no se escribió nada)'); process.exit(0); }

// Rebuild the file from parts (cleaner than patching lines in place):
//   header comments | kept verts + fresh wall verts | sections with new faces.
const otherFacesTotal = sections
  .filter((s) => s.name !== 'walls')
  .reduce((n, s) => n + s.faces.length, 0);
const totalFaces = nWallFaces + otherFacesTotal;
const header = [];
for (const line of lines) {
  const t = line.trim();
  if (t[0] === 'v' && (t[1] === ' ' || t[1] === '\t')) break;
  header.push(/^#\s*\d+\s+verts,\s*\d+\s+faces/.test(t)
    ? '# ' + nv + ' verts, ' + totalFaces + ' faces'
    : line);
}
const body = [];
const ceilSection = sections.find((s) => s.name === 'ceilings');
const ceilVerts = new Set();
if (ceilSection) for (const f of ceilSection.faces) for (const i of f) ceilVerts.add(i);
const ceilComment = lines.find((l) => /^#\s*ceilings:/.test(l.trim()));
let ceilCommentDone = !ceilComment;
for (let i = 1; i <= V.length - 1; i++) {
  if (!usedElsewhere.has(i)) continue;
  if (!ceilCommentDone && ceilVerts.has(i)) { body.push(ceilComment); ceilCommentDone = true; }
  const v = V[i];
  body.push('v ' + fmt(v.x) + ' ' + fmt(v.y) + ' ' + fmt(v.z));
}
for (const w of wallVerts) body.push('v ' + fmt(w.x) + ' ' + fmt(w.y) + ' ' + fmt(w.z));
for (const s of sections) {
  body.push('o ' + s.name);
  const fs = s.name === 'walls'
    ? wallFaces
    : s.faces.map((f) => f.map((i) => newIndex[i]));
  for (const f of fs) body.push('f ' + f.join(' '));
}

fs.writeFileSync(OUT, header.join('\n') + '\n' + body.join('\n') + '\n');
log('escrito: ' + path.relative(process.cwd(), OUT) +
  ' — ' + nv + ' verts, ' + totalFaces + ' faces');
