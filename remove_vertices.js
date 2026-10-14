#!/usr/bin/env node
/*
 * remove_vertices.js — surgically remove vertices from floorplan.obj
 *
 * Companion to the Ctrl+D "eliminar vértices" tool in index.html / viewer.html.
 * That tool highlights the vertex nearest the screen centre, removes it live and
 * copies a list like:
 *
 *     # Vértices de floorplan.obj a eliminar (índices 1-based):
 *     [91, 90, 122, 123, ...]
 *
 * This script applies such a list permanently to the OBJ file:
 *   1. Removes every listed vertex.
 *   2. Also removes the "equivalent" vertices: any other vertex that shares the
 *      same footprint (x, y) within `--tol` metres. In practice this is the wall
 *      strip's counterpart at ceiling height (z = 2.7) — and any true ceiling
 *      vertex at the same plan position, if one exists.
 *   3. Drops every face that referenced a removed vertex.
 *   4. Prunes vertices left unused by any face (invisible orphans) unless
 *      --keep-orphans is given.
 *   5. Renumbers all remaining face indices and refreshes the header count.
 *
 * Model space (OBJ file):  x = east (m), y = north (m), z = height (m).
 *
 * Usage:
 *   node remove_vertices.js 91 90 122 123 ...      # indices as arguments
 *   node remove_vertices.js --file list.txt        # read a copied list
 *   node remove_vertices.js --dry-run 91 90        # report, do not write
 *
 * Options:
 *   --file <path>    read indices from a file (uses the first [..] block, else
 *                    parses all integers in it)
 *   --tol <m>        footprint tolerance for "equivalent" vertices (default 0.001)
 *   --keep-orphans   keep vertices no longer referenced by any face
 *   --dry-run        print what would happen without rewriting the file
 *   --out <path>     write to a different file (default: floorplan.obj in place)
 *
 * The script is idempotent for re-runs only if vertex indices are unchanged, so
 * after each run re-copy a fresh list from the viewer if you remove more.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DEFAULT_OBJ = path.join(__dirname, 'floorplan.obj');

function parseArgs(argv) {
  const opts = { file: null, tol: 0.001, keepOrphans: false, dryRun: false, out: null, indices: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file') opts.file = argv[++i];
    else if (a === '--tol') opts.tol = parseFloat(argv[++i]);
    else if (a === '--keep-orphans') opts.keepOrphans = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--out') opts.out = argv[++i];
    else if (/^\d+$/.test(a)) opts.indices.push(parseInt(a, 10));
    else { console.error('argumento no reconocido: ' + a); process.exit(2); }
  }
  return opts;
}

function readIndicesFromFile(p) {
  const txt = fs.readFileSync(p, 'utf8');
  const bracket = txt.match(/\[([\d,\s]+)\]/);           // the copied [..] block
  const src = bracket ? bracket[1] : txt;
  return (src.match(/\d+/g) || []).map((n) => parseInt(n, 10));
}

const opts = parseArgs(process.argv.slice(2));
if (opts.file) opts.indices = opts.indices.concat(readIndicesFromFile(opts.file));
// de-dup, ascending
opts.indices = [...new Set(opts.indices)].sort((a, b) => a - b);
if (!opts.indices.length) {
  console.error('sin vértices a eliminar. Pasá índices o usá --file <lista>.');
  process.exit(2);
}

const OBJ = opts.out ? path.resolve(opts.out) : DEFAULT_OBJ;
const lines = fs.readFileSync(OBJ, 'utf8').split('\n');

// ---- 1. parse ------------------------------------------------------------
const V = [];                       // 1-based source: V[i] = {x,y,z}
const faces = [];                   // {line, idx:[old1-based...]}
const vAtLine = new Map();          // lineIndex -> 1-based vertex index
const fAtLine = new Map();          // lineIndex -> face object
for (let li = 0; li < lines.length; li++) {
  const t = lines[li].trim();
  if (t[0] === 'v' && (t[1] === ' ' || t[1] === '\t')) {
    const p = t.split(/\s+/);
    V.push({ x: +p[1], y: +p[2], z: +p[3] });
    vAtLine.set(li, V.length);
  } else if (t[0] === 'f' && (t[1] === ' ' || t[1] === '\t')) {
    const idx = t.split(/\s+/).slice(1).map((s) => parseInt(s.split('/')[0], 10));
    const f = { line: lines[li], idx };
    faces.push(f);
    fAtLine.set(li, f);
  }
}
const N = V.length;
const bad = opts.indices.filter((i) => i < 1 || i > N);
if (bad.length) { console.error('índices fuera de rango (1..' + N + '): ' + bad.join(', ')); process.exit(2); }

// ---- 2. removal set: listed vertices + footprint-equivalent vertices -----
const removed = new Set(opts.indices);
for (const i of opts.indices) {
  const v = V[i - 1];
  for (let j = 1; j <= N; j++) {
    if (Math.abs(V[j - 1].x - v.x) <= opts.tol && Math.abs(V[j - 1].y - v.y) <= opts.tol) removed.add(j);
  }
}
const nEquiv = removed.size - opts.indices.length;

// ---- 3. surviving faces + referenced vertices ----------------------------
const keptFaces = faces.filter((f) => !f.idx.some((i) => removed.has(i)));
const referenced = new Set();
for (const f of keptFaces) for (const i of f.idx) referenced.add(i);

// ---- 4. optional orphan pruning -----------------------------------------
if (!opts.keepOrphans) {
  for (let i = 1; i <= N; i++) if (!referenced.has(i)) removed.add(i);
}

// ---- 5. renumber kept vertices ------------------------------------------
const newIndex = new Array(N + 1).fill(0);
let nv = 0;
for (let i = 1; i <= N; i++) if (!removed.has(i)) newIndex[i] = ++nv;

// ---- 6. rewrite ----------------------------------------------------------
const out = [];
for (let li = 0; li < lines.length; li++) {
  const line = lines[li];
  const t = line.trim();
  if (vAtLine.has(li)) {
    if (removed.has(vAtLine.get(li))) continue;
    out.push(line);
  } else if (fAtLine.has(li)) {
    const f = fAtLine.get(li);
    if (f.idx.some((i) => removed.has(i))) continue; // face touched a removed vertex
    out.push('f ' + f.idx.map((i) => newIndex[i]).join(' '));
  } else if (/^#\s*\d+\s+verts,\s*\d+\s+faces/.test(t)) {
    out.push('# ' + nv + ' verts, ' + keptFaces.length + ' faces');
  } else {
    out.push(line);
  }
}

console.log('vértices solicitados : ' + opts.indices.length);
console.log('  + equivalentes (misma huella x,y): ' + nEquiv);
console.log('  - huérfanos podados               : ' + (removed.size - opts.indices.length - nEquiv));
console.log('caras eliminadas     : ' + (faces.length - keptFaces.length));
console.log('resultado            : ' + nv + ' verts, ' + keptFaces.length + ' faces (antes ' + N + '/' + faces.length + ')');

if (opts.dryRun) { console.log('(--dry-run: no se escribió nada)'); process.exit(0); }
fs.writeFileSync(OBJ, out.join('\n'));
console.log('escrito: ' + path.relative(process.cwd(), OBJ));
