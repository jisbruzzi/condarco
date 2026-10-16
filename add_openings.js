#!/usr/bin/env node
/*
 * add_openings.js — cut window / door openings (holes) into floorplan.obj
 *
 * Model space (OBJ file):  x = east (m), y = north (m), z = height (m).
 * Wall boxes run z 0 → 2.7 m; the plinth collars cover z 0 → 0.06 m.
 *
 * This pass carves axis-aligned openings out of the `walls` (and the matching
 * `plinths` feet) section.  Each opening is described by an axis-aligned void
 * box in world metres; every wall box that overlaps a void is split into the
 * pieces that remain around it (classic 6-slab decomposition), so a window
 * keeps its sill below, its lintel above and its jambs on either side.
 *
 * No window/door leaf or glazing is added — only the holes in the masonry.
 *
 * Openings (see README § "Windows & sliding balcony door"):
 *   window1  entrance  N-S wall, 38 cm from the corner with vertex #282, 140 cm wide
 *   window2  kitchen   E-W wall, 74 cm from the corner with vertex #834,  60 cm wide
 *   window3  living    E-W wall, 72 cm from #1107 and 28 cm from #844
 *   balcony  sliding door N-S wall, 30 cm from #834 and 16 cm from #1107, 210 cm high
 *
 * All windows: sill 0.95 m, height 1.10 m (so 0.95 → 2.05 m).
 *
 * Usage:  node add_openings.js            (rewrites floorplan.obj in place)
 *         node add_openings.js --dry-run
 *         node add_openings.js --out x.obj
 */
'use strict';
const fs = require('fs');
const path = require('path');

const OBJ = path.join(__dirname, 'floorplan.obj');

// ---------------------------------------------------------------------------
// Opening void boxes, in world metres [x0, x1, y0, y1, z0, z1].
// The `x`/`y` extents span the full wall thickness so the hole cuts through.
// ---------------------------------------------------------------------------
const SILL = 0.95, WIN_H = 1.10;          // windows: 95 cm to 205 cm
const WIN_TOP = SILL + WIN_H;
const DOOR_H = 2.10;                       // sliding balcony door: floor to 210 cm

const OPENINGS = [
  // window 1 — entrance, N-S wall (x 0.831..1.044). Corner v282 at y -8.4973.
  { name: 'window1', x0: 0.831, x1: 1.044, y0: -8.4973 + 0.38, y1: -8.4973 + 0.38 + 1.40, z0: SILL, z1: WIN_TOP },
  // window 2 — kitchen, E-W wall (y 5.272..5.485). Corner v834 at x 1.7187, westward.
  { name: 'window2', x0: 1.7187 - 0.74 - 0.60, x1: 1.7187 - 0.74, y0: 5.272, y1: 5.4852, z0: SILL, z1: WIN_TOP },
  // window 3 — living-room band, E-W wall (y 8.498..8.601). From v1107 east, to 28 cm short of v844.
  // The y span covers the full exterior wall assembly here (inner leaf + glazing
  // wall + outer leaf, up to y 8.7107) so the hole goes right through.
  { name: 'window3', x0: 1.719 + 0.72, x1: 5.9263 - 0.28, y0: 8.498, y1: 8.7107, z0: SILL, z1: WIN_TOP },
  // sliding balcony door — N-S wall (x 1.491..1.704). From v834 (y 5.2572) to v1107 (y 8.5127).
  { name: 'balcony_door', x0: 1.491, x1: 1.704, y0: 5.2572 + 0.30, y1: 8.5127 - 0.16, z0: 0.0, z1: DOOR_H },
];

const MINW = 1e-4; // drop rounding slivers

function parseArgs(argv) {
  const o = { dryRun: false, out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') o.dryRun = true;
    else if (argv[i] === '--out') o.out = argv[++i];
    else { console.error('argumento no reconocido: ' + argv[i]); process.exit(2); }
  }
  return o;
}
const opts = parseArgs(process.argv.slice(2));
const OUT = opts.out ? path.resolve(opts.out) : OBJ;

// ---- parse vertices + sections -------------------------------------------
const lines = fs.readFileSync(OBJ, 'utf8').split('\n');
const V = [null]; // 1-based
for (const line of lines) {
  const t = line.trim();
  if (t[0] === 'v' && (t[1] === ' ' || t[1] === '\t')) {
    const p = t.split(/\s+/);
    V.push({ x: +p[1], y: +p[2], z: +p[3] });
  }
}
const sections = [];
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

// ---- boxes of a section: each 6-face / 8-vert block -> {x0,x1,y0,y1,z0,z1} --
function boxesOf(sectionName) {
  const sec = sections.find((s) => s.name === sectionName);
  if (!sec) return [];
  const parent = new Map();
  const find = (a) => { let r = a; while (parent.get(r) !== r) r = parent.get(r); return r; };
  sec.faces.forEach((f, i) => parent.set(i, i));
  const byVert = new Map();
  sec.faces.forEach((f, i) => f.forEach((v) => { if (!byVert.has(v)) byVert.set(v, []); byVert.get(v).push(i); }));
  for (const lst of byVert.values()) for (let k = 1; k < lst.length; k++) {
    const a = find(lst[0]), b = find(lst[k]); if (a !== b) parent.set(b, a);
  }
  const comps = new Map();
  sec.faces.forEach((f, i) => { const r = find(i); if (!comps.has(r)) comps.set(r, []); comps.get(r).push(f); });
  const out = [];
  for (const faces of comps.values()) {
    const ids = new Set();
    faces.forEach((f) => f.forEach((v) => ids.add(v)));
    const vs = [...ids].map((i) => V[i]);
    const xs = [...new Set(vs.map((v) => v.x.toFixed(4)))].map(Number).sort((a, b) => a - b);
    const ys = [...new Set(vs.map((v) => v.y.toFixed(4)))].map(Number).sort((a, b) => a - b);
    const zs = [...new Set(vs.map((v) => v.z.toFixed(4)))].map(Number).sort((a, b) => a - b);
    if (xs.length === 2 && ys.length === 2 && zs.length === 2) {
      out.push({ x0: xs[0], x1: xs[1], y0: ys[0], y1: ys[1], z0: zs[0], z1: zs[1] });
    }
  }
  return out;
}

// ---- axis-aligned box subtraction -----------------------------------------
function overlaps(a, b) {
  return a.x0 < b.x1 - MINW && a.x1 > b.x0 + MINW &&
         a.y0 < b.y1 - MINW && a.y1 > b.y0 + MINW &&
         a.z0 < b.z1 - MINW && a.z1 > b.z0 + MINW;
}
// Return the parts of A that remain after removing B (up to 6 slabs, disjoint).
function subtract(A, B) {
  if (!overlaps(A, B)) return [A];
  const ox0 = Math.max(A.x0, B.x0), ox1 = Math.min(A.x1, B.x1);
  const oy0 = Math.max(A.y0, B.y0), oy1 = Math.min(A.y1, B.y1);
  const oz0 = Math.max(A.z0, B.z0), oz1 = Math.min(A.z1, B.z1);
  const out = [];
  const keep = (x0, x1, y0, y1, z0, z1) => {
    if (x1 - x0 > MINW && y1 - y0 > MINW && z1 - z0 > MINW) out.push({ x0, x1, y0, y1, z0, z1 });
  };
  keep(A.x0, B.x0, A.y0, A.y1, A.z0, A.z1);   // west of hole
  keep(B.x1, A.x1, A.y0, A.y1, A.z0, A.z1);   // east of hole
  keep(ox0, ox1, A.y0, B.y0, A.z0, A.z1);     // south of hole (within x-overlap)
  keep(ox0, ox1, B.y1, A.y1, A.z0, A.z1);     // north of hole
  keep(ox0, ox1, oy0, oy1, A.z0, B.z0);       // below hole (sill)
  keep(ox0, ox1, oy0, oy1, B.z1, A.z1);       // above hole (lintel)
  return out;
}

// Plinth collars stick out 1.5 cm beyond each wall face. A hole carved only to
// the wall face leaves that overhang running across the opening (a floating
// baseboard), so for the plinths we widen each void by PAD on its thin
// (wall-thickness) axis to swallow the whole collar.
const PAD = 0.02;

function paddedVoid(v) {
  const thinX = (v.x1 - v.x0) <= (v.y1 - v.y0);
  return thinX
    ? { ...v, x0: v.x0 - PAD, x1: v.x1 + PAD }
    : { ...v, y0: v.y0 - PAD, y1: v.y1 + PAD };
}

function carve(boxes, label, pad) {
  let list = boxes;
  let removed = 0;
  for (const raw of OPENINGS) {
    const v = pad ? paddedVoid(raw) : raw;
    const next = [];
    for (const b of list) {
      const parts = subtract(b, v);
      if (parts.length === 1 && parts[0] === b) next.push(b); // untouched
      else { removed++; next.push(...parts); }
    }
    list = next;
  }
  console.log(`${label}: ${boxes.length} -> ${list.length} boxes (${removed} carved intersects)`);
  return list;
}

const wallBoxes = boxesOf('walls');
const plinthBoxes = boxesOf('plinths');
if (!wallBoxes.length) { console.error('no se encontraron cajas en walls'); process.exit(2); }

// Report which wall boxes each opening cuts (sanity check).
for (const v of OPENINGS) {
  const hit = wallBoxes.filter((b) => overlaps(b, v));
  console.log(`${v.name}: corta ${hit.length} caja(s) de pared` +
    (hit.length ? ' -> ' + hit.map((b) => `x${b.x0}..${b.x1} y${b.y0}..${b.y1}`).join(' | ') : ' (¡ninguna!)'));
}

const newWalls = carve(wallBoxes, 'walls', false);
const newPlinths = carve(plinthBoxes, 'plinths', true);

// ---- rebuild ---------------------------------------------------------------
const fmt = (n) => n.toFixed(4);
function emitBoxes(rects) {
  const verts = [], faces = [];
  for (const r of rects) {
    const b = verts.length;
    verts.push(
      { x: r.x0, y: r.y0, z: r.z0 }, { x: r.x1, y: r.y0, z: r.z0 },
      { x: r.x1, y: r.y1, z: r.z0 }, { x: r.x0, y: r.y1, z: r.z0 },
      { x: r.x0, y: r.y0, z: r.z1 }, { x: r.x1, y: r.y0, z: r.z1 },
      { x: r.x1, y: r.y1, z: r.z1 }, { x: r.x0, y: r.y1, z: r.z1 },
    );
    const W = (k) => b + k;
    faces.push(
      [W(1), W(2), W(3), W(4)],
      [W(5), W(8), W(7), W(6)],
      [W(1), W(5), W(6), W(2)],
      [W(2), W(6), W(7), W(3)],
      [W(3), W(7), W(8), W(4)],
      [W(4), W(8), W(5), W(1)],
    );
  }
  return { verts, faces };
}

const usedElsewhere = new Set();
for (const s of sections) {
  if (s.name === 'walls' || s.name === 'plinths') continue;
  for (const f of s.faces) for (const i of f) usedElsewhere.add(i);
}
const newIndex = new Array(V.length).fill(0);
let nv = 0;
for (let i = 1; i <= V.length - 1; i++) if (usedElsewhere.has(i)) newIndex[i] = ++nv;

const wallPart = emitBoxes(newWalls);
const wallBase = nv; nv += wallPart.verts.length;
const wallIndex = wallPart.faces.map((f) => f.map((i) => i + wallBase));

const plinthPart = emitBoxes(newPlinths);
const plinthBase = nv; nv += plinthPart.verts.length;
const plinthIndex = plinthPart.faces.map((f) => f.map((i) => i + plinthBase));

const otherFaces = sections.filter((s) => s.name !== 'walls' && s.name !== 'plinths').reduce((n, s) => n + s.faces.length, 0);
const totalFaces = wallPart.faces.length + plinthPart.faces.length + otherFaces;

if (opts.dryRun) { console.log('(--dry-run: nada escrito)'); process.exit(0); }

const header = [];
for (const line of lines) {
  const t = line.trim();
  if (t[0] === 'v' && (t[1] === ' ' || t[1] === '\t')) break;
  header.push(/^#\s*\d+\s+verts,\s*\d+\s+faces/.test(t) ? '# ' + nv + ' verts, ' + totalFaces + ' faces' : line);
}
const ceilComment = lines.find((l) => /^#\s*ceilings:/.test(l.trim()));
const ceilVerts = new Set();
{ const cs = sections.find((s) => s.name === 'ceilings'); if (cs) for (const f of cs.faces) for (const i of f) ceilVerts.add(i); }
const plinthComment = lines.find((l) => /^#\s*plinths:/.test(l.trim()));

const body = [];
let ceilDone = !ceilComment;
for (let i = 1; i <= V.length - 1; i++) {
  if (!usedElsewhere.has(i)) continue;
  if (!ceilDone && ceilVerts.has(i)) { body.push(ceilComment); ceilDone = true; }
  const v = V[i];
  body.push('v ' + fmt(v.x) + ' ' + fmt(v.y) + ' ' + fmt(v.z));
}
if (ceilComment && !ceilDone) body.push(ceilComment);
body.push(plinthComment || '# plinths');
for (const w of wallPart.verts) body.push('v ' + fmt(w.x) + ' ' + fmt(w.y) + ' ' + fmt(w.z));
for (const w of plinthPart.verts) body.push('v ' + fmt(w.x) + ' ' + fmt(w.y) + ' ' + fmt(w.z));
for (const s of sections) {
  body.push('o ' + s.name);
  let fs;
  if (s.name === 'walls') fs = wallIndex;
  else if (s.name === 'plinths') fs = plinthIndex;
  else fs = s.faces.map((f) => f.map((i) => newIndex[i]));
  for (const f of fs) body.push('f ' + f.join(' '));
}

fs.writeFileSync(OUT, header.join('\n') + '\n' + body.join('\n') + '\n');
console.log('escrito: ' + path.relative(process.cwd(), OUT) + ' — ' + nv + ' verts, ' + totalFaces + ' faces');
console.log('walls ' + newWalls.length + ' cajas / ' + wallPart.faces.length + ' caras · plinths ' +
  newPlinths.length + ' cajas / ' + plinthPart.faces.length + ' caras');
