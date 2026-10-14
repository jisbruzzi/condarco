#!/usr/bin/env node
/*
 * add_ceilings.js — append ceiling geometry to floorplan.obj
 *
 * Model space (OBJ file):  x = east (m), y = north (m), z = height (m).
 * The viewer rotates -90 deg about X, so in the walk-around the HUD shows
 *   world X = obj x ,  world Y = obj z (height) ,  world Z = -obj y .
 *
 * Heights:
 *   main ceiling .......... 2.60 m (everywhere else)
 *   entry corridor ........ 2.20 m   (south hall from the front door)
 *   cross corridor ........ 2.20 m   (hall between bedrooms / bath / living)
 *   kitchen ............... 2.20 m
 *
 * The low zones are snapped to wall centre-lines so their drop-soffit faces
 * land inside the walls (no z-fighting) and only surface across open sides.
 *
 * Usage:  node add_ceilings.js            (rewrites floorplan.obj in place)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const OBJ = path.join(__dirname, 'floorplan.obj');
const H_MAIN = 2.60;
const H_LOW = 2.20;

// Building envelope (wall centre-lines), clockwise.
const ENVELOPE = [
  [-6.035,  8.620],
  [ 6.045,  8.620],
  [ 6.045, -3.765],
  [ 2.715, -3.765],
  [ 2.715, -8.605],
  [ 0.935, -8.605],
  [ 0.935, -5.195],
  [-6.035, -5.195],
];

// Low (2.20 m) ceiling zones: [x0, x1, y0, y1]
const LOW = [
  [0.935, 2.715, -8.605, -3.765], // entry corridor
  [-2.870, 1.615, -1.330, 0.375], // cross corridor
  [-1.440, 1.615, 0.375, 5.380],  // kitchen
];

function inside(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) c = !c;
  }
  return c;
}
function inLow(x, y) {
  return LOW.some(([x0, x1, y0, y1]) => x > x0 && x < x1 && y > y0 && y < y1);
}

const uniq = (a) => [...new Set(a.map((v) => +v.toFixed(4)))].sort((p, q) => p - q);
const xs = uniq([...ENVELOPE.map((p) => p[0]), ...LOW.flatMap((r) => [r[0], r[1]])]);
const ys = uniq([...ENVELOPE.map((p) => p[1]), ...LOW.flatMap((r) => [r[2], r[3]])]);

const verts = [];   // [x,y,z]
const faces = [];   // arrays of vertex indices (0-based)

function quad(a, b, c, d) {
  const i = verts.length;
  verts.push(a, b, c, d);
  faces.push([i, i + 1, i + 2, i + 3]);
}
// horizontal ceiling tile, corners (x0,y0)-(x1,y1) at height h
function tile(x0, x1, y0, y1, h) {
  quad([x0, y0, h], [x0, y1, h], [x1, y1, h], [x1, y0, h]);
}
// vertical drop/soffit face along a grid line
function stepX(x, y0, y1) { // face is a plane x=const, spans y and z
  quad([x, y0, H_LOW], [x, y1, H_LOW], [x, y1, H_MAIN], [x, y0, H_MAIN]);
}
function stepY(y, x0, x1) { // face is a plane y=const
  quad([x0, y, H_LOW], [x1, y, H_LOW], [x1, y, H_MAIN], [x0, y, H_MAIN]);
}

// height grid over the envelope, one value per cell
const nh = ys.length - 1, nw = xs.length - 1;
const H = [];
for (let j = 0; j < nh; j++) {
  H[j] = [];
  for (let i = 0; i < nw; i++) {
    const cx = (xs[i] + xs[i + 1]) / 2;
    const cy = (ys[j] + ys[j + 1]) / 2;
    H[j][i] = inside(ENVELOPE, cx, cy) ? (inLow(cx, cy) ? H_LOW : H_MAIN) : null;
  }
}

// horizontal tiles + vertical steps between differing neighbouring cells
for (let j = 0; j < nh; j++) {
  for (let i = 0; i < nw; i++) {
    const h = H[j][i];
    if (h === null) continue;
    tile(xs[i], xs[i + 1], ys[j], ys[j + 1], h);
    const right = i + 1 < nw ? H[j][i + 1] : null;
    if (right !== null && right !== h) stepX(xs[i + 1], ys[j], ys[j + 1]);
    const up = j + 1 < nh ? H[j + 1][i] : null;
    if (up !== null && up !== h) stepY(ys[j + 1], xs[i], xs[i + 1]);
  }
}

// ---- append to OBJ (idempotent: drop a previous ceilings pass first) -----
let txt = fs.readFileSync(OBJ, 'utf8');
const marker = '\n# ceilings:';
const prev = txt.indexOf(marker);
if (prev >= 0) txt = txt.slice(0, prev); // remove earlier appended block
txt = txt.replace(/\s*$/, '\n');
const base = (txt.match(/^v\s/gm) || []).length; // existing vertex count
let out = txt;
out += `\n# ceilings: ${H_MAIN} m main, ${H_LOW} m over the two halls + kitchen\n`;
for (const v of verts) out += `v ${v[0].toFixed(4)} ${v[1].toFixed(4)} ${v[2].toFixed(4)}\n`;
out += 'o ceilings\n';
for (const f of faces) out += 'f ' + f.map((k) => k + base + 1).join(' ') + '\n';

const nv = base + verts.length;
const nf = (txt.match(/^f\s/gm) || []).length + faces.length;
out = out.replace(/#\s*\d+\s+verts,\s*\d+\s+faces/, `# ${nv} verts, ${nf} faces`);
fs.writeFileSync(OBJ, out);

console.log(`ceilings: ${faces.length} faces (${verts.length} verts), tiles+soffits`);
console.log(`OBJ now ${nv} verts, ${nf} faces`);

// height map dump for eyeballing
let map = '';
for (let j = nh - 1; j >= 0; j--) {
  let row = '';
  for (let i = 0; i < nw; i++) row += H[j][i] === null ? ' ' : H[j][i] === H_LOW ? '2' : '.';
  map += (ys[j].toFixed(2) + '  ').padStart(7) + row + '\n';
}
console.log('height map (rows y top->bottom, "2"=2.20m, "."=2.60m)');
console.log(map);
