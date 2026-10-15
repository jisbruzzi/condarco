#!/usr/bin/env node
/*
 * add_plinths.js — append wooden plinth (skirting board) geometry to floorplan.obj
 *
 * Model space (OBJ file):  x = east (m), y = north (m), z = height (m).
 *
 * A plinth is a 6 cm tall, 1.5 cm deep wooden baseboard that runs along the
 * foot of every wall.  For each wall box we emit a slightly larger collar box
 * (the wall footprint expanded 1.5 cm on all four sides, from z = 0 to 0.06 m);
 * seen from either room this reads as a 1.5 cm skirting wrapped around the
 * wall base, and it follows every wall run automatically.
 *
 * Usage:  node add_plinths.js            (rewrites floorplan.obj in place)
 * Re-run after regenerating the walls (e.g. clean_walls.js / build_obj.py).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const OBJ = path.join(__dirname, 'floorplan.obj');
const PLINTH_H = 0.06;   // 6 cm tall
const PLINTH_D = 0.015;  // 1.5 cm proud of the wall face

const lines = fs.readFileSync(OBJ, 'utf8').split('\n');

const verts = [];  // 0-based [x,y,z] in file order
for (const l of lines) {
  if (/^v\s/.test(l)) { const p = l.split(/\s+/); verts.push([+p[1], +p[2], +p[3]]); }
}

// wall vertex indices (from the "o walls" faces)
const start = lines.indexOf('o walls') + 1;
if (start === 0) throw new Error('no "o walls" group found');
const idx = new Set();
for (let k = start; k < lines.length; k++) {
  const l = lines[k];
  if (/^o\s/.test(l)) break;
  if (/^f\s/.test(l)) l.split(/\s+/).slice(1).forEach((i) => idx.add(+i));
}
const ids = [...idx].sort((a, b) => a - b);

// each wall box = 8 consecutive vertices
const boxes = [];
for (let k = 0; k + 7 < ids.length; k += 8) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let j = 0; j < 8; j++) {
    const [x, y] = verts[ids[k + j] - 1];
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  boxes.push([x0 - PLINTH_D, y0 - PLINTH_D, x1 + PLINTH_D, y1 + PLINTH_D]);
}

// box with the same vertex order / winding as the rest of the model (inward normals)
function box(x0, y0, x1, y1, z0, z1) {
  const v = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ];
  const f = [[1, 2, 3, 4], [5, 8, 7, 6], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 8, 4], [4, 8, 5, 1]];
  return { v, f };
}

const pv = [];  // plinth verts
const pf = [];  // plinth faces (1-based, local)
for (const [x0, y0, x1, y1] of boxes) {
  const b = box(x0, y0, x1, y1, 0, PLINTH_H);
  const base = pv.length;
  pv.push(...b.v);
  for (const f of b.f) pf.push(f.map((i) => i + base));
}

// ---- append to OBJ (idempotent: drop a previous plinths pass first) --------
let txt = fs.readFileSync(OBJ, 'utf8');
const marker = '\n# plinths:';
const prev = txt.indexOf(marker);
if (prev >= 0) txt = txt.slice(0, prev);
txt = txt.replace(/\s*$/, '\n');
const base = (txt.match(/^v\s/gm) || []).length;  // existing vertex count

let out = txt;
out += `\n# plinths: ${PLINTH_H} m tall, ${PLINTH_D} m deep, one collar per wall box\n`;
for (const v of pv) out += `v ${v[0].toFixed(4)} ${v[1].toFixed(4)} ${v[2].toFixed(4)}\n`;
out += 'o plinths\n';
for (const f of pf) out += 'f ' + f.map((k) => k + base).join(' ') + '\n';

const nv = base + pv.length;
const nf = (txt.match(/^f\s/gm) || []).length + pf.length;
out = out.replace(/#\s*\d+\s+verts,\s*\d+\s+faces/, `# ${nv} verts, ${nf} faces`);
fs.writeFileSync(OBJ, out);

console.log(`plinths: ${pf.length} faces (${pv.length} verts) — ${boxes.length} wall boxes`);
console.log(`OBJ now ${nv} verts, ${nf} faces`);
