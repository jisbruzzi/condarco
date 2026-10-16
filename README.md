# Floor Plan Extraction & 3D Model — Project Notes

Working folder: `/home/jose/condarco`

This project took the original Illustrator-exported apartment-decoration SVG
(`3 amb Deco.svg`, 66 MB, dozens of scattered drawings), located the
**architectural floor plan** hidden in it, isolated it into a clean standalone
SVG, and generated a **boxy low-fidelity 3D model (Wavefront OBJ)** from it for
iterative refinement (windows, doors, furniture to be added later).

---

## 1. Source file

### `3 amb Deco.svg` (NOT modified, 66,103,588 bytes)

Adobe Illustrator 26.5.3 export, `viewBox="0 0 977.95 2426.46"` — but the
actual artwork is scattered far outside that page over roughly
*x ∈ [-2400, 6600], y ∈ [-2500, 3500]* (multiple "artboards" side by side).
Most of the 66 MB is base64-embedded JPEG photos (moodboard).

Top-level layers found:

| Layer | Content | Location (doc units) |
|---|---|---|
| `Capa_1` | **The floor plan**: walls, doors, windows, kitchen/bathroom fixtures, dimension marks | x ≈ [-1440, 1020], y ≈ [-47, 3443] |
| `Capa_2` | empty | — |
| `guias` | empty, hidden (`display:none`, class `st9`) | — |
| `Comedor` | Big white board, black furniture blocks ("Mesa actual" dining set, black rects), "Placard" label, moodboard photo board + embedded JPEGs | x ≈ [-5, 6500] |
| `Vista_Pared` | Wall elevation drawings ("tv 32", wardrobe fronts) | x ≈ [800, 3100], y < 0 |
| `Hab_Lucas` | Lucas room furniture + a detached bed side-view at x ≈ [-2148, -1603] | y ≈ [1753, 2987] |
| `Hab_grande` | Master bedroom furniture (bed outline, desk, nightstands) | x ≈ [-1393, 864] |
| `DECO_COMEDO_tv` | TV-unit decoration drawings | x ≈ [3510, 4165] |

Stroke classes: `st0` (1.14 main walls), `st2` (0.42 reveals), `st8` (0.27),
`st4`/`st6` (fixtures, window sills), `st1`/`st5` (hairlines/guides, e.g.
wardrobe hatching `VAVA`), `st9` (hidden), `st7` (invisible 0-width).

---

## 2. Main deliverables

### `floorplan.svg` (65,965 bytes) — the isolated floor plan

- Provenance: layers `Capa_1` (architecture) + `Comedor`, `Hab_grande`,
  `Hab_Lucas` (furniture overlays) — this is confirmed candidate **B**.
- Every element outside the plan region was pruned; embedded images excluded.
- Cleaning pass removed: 2 canvas page-divider lines at x≈979, 4 zero-length
  marker lines, 1 off-canvas text, plus all pruned leftovers.
- `viewBox="-1463.8 -69.2 2471.1 3537.2"` — tight around the ink with a 25-unit
  padding; verified by pixel-scan of a render (symmetric ~18 px margins).
- Preserves the original Illustrator CSS style block and layer ids, so it can
  be re-imported into a larger drawing unchanged.

Contents visible: living/dining ("Mesa actual" + 6 chairs), kitchen (stove,
double sink, fridge), master bedroom (bed + "Escritorio Jose") top-left room,
wardrobe run (hatched), full bathroom (toilet, bidet, bathtub, basin),
"Placard" closet, red sofa module, corner couch + round table, balcony with
door, "Mesa comedor" replacement-table label.

### `floorplan.obj` (30,747 bytes) — boxy low-fi 3D model

Generated **only from `Capa_1` linework** (black furniture ignored per plan;
kitchen/bath/bed areas coarse-blocked per instruction, iterate later).

- Units: **meters**, Y-up, Z-north, model centered on plan center.
- Scale: **1 SVG unit = 5 mm** (`S = 0.005`) — calibrated against bed length
  (~1.8 m), counter depth (~44 cm), fridge width (~68 cm), wall thicknesses.
- Wall thickness modules found in the drawing: **14.2 / 28.3 / 42.6 units**
  (= 7 / 14 / 21 cm) plus a thin 8.5-unit glazing wall (4 cm).
- Geometry: 86 axis-aligned boxes = 688 verts / 516 quads, plus a `ceilings`
  pass = 44 quads (31 tiles + 13 drop-soffit faces), 176 verts. Built as
  **864 verts / 560 faces**; after a vertex-removal pass (see the vertex tool
  below) it was **822 verts / 500 faces**, and after the wall-overlap cleanup
  (`clean_walls.js`, below) it is now **672 verts / 416 faces**; the plinth pass
  (`add_plinths.js`) then adds 56 wooden baseboards = 448 verts / 336 faces, and
  the openings pass (`add_openings.js`, below) carves the window/balcony holes,
  leaving **1296 verts / 884 faces**. Extents
  X [-6.30, 6.15], Y [-8.88, 8.87], Z [-0.05, 2.70].

Groups:

| Group | Faces | Contents | Height |
|---|---|---|---|
| `walls` | 450 (75 disjoint boxes) | All wall strips: exterior ~21 cm, interior ~14 cm, thin ~4 cm, balcony walls. Window/door openings are cut as holes (see the openings pass below). The boxes never overlap, so every plan corner is a real vertex the viewer can select. | 2.70 m |
| `floor` | 6 (1 box) | Full footprint slab 12.45 m × 17.75 m | 0.05 m (z −0.05→0) |
| `block_bed1` | 6 | Master bed placeholder, footprint 2.9 × 2.35 m | 0.55 m |
| `block_bed2` | 6 | Lucas bed placeholder, 1.35 × 2.7 m | 0.55 m |
| `block_wardrobe` | 6 | Closet band, 3.15 × 1.4 m | 2.30 m |
| `block_bath` | 6 | Whole bathroom block (fixtures inside) | 0.90 m |
| `block_kitchen` | 6 | Kitchen counter band, 0.44 × 4.9 m | 0.90 m |
| `ceilings` | 44 | Horizontal ceiling tiles + vertical drop-soffit faces (see below) | 2.60 m main / 2.20 m low |
| `plinths` | 336 (56 boxes) | Wooden baseboard collar around the foot of every wall box (see below) | 0.06 m |

#### Ceilings (added after the main build)

Added by `add_ceilings.js` (run `node add_ceilings.js` to regenerate). Ceiling
zones are axis-aligned rectangles snapped to **wall centre-lines** so the
2.20 → 2.60 drop faces land inside the walls (only surfacing across open
sides); the wall tops stay at 2.70 m and hide the ceiling edges.

| Zone (OBJ, metres) | Footprint x0,x1 × y0,y1 | Height |
|---|---|---|
| main | building envelope minus the low zones | 2.60 m |
| entry corridor (south hall off the front door) | 0.94, 2.72 × −8.61, −3.77 | 2.20 m |
| cross corridor (bedrooms / bath / living) | −2.87, 1.62 × −1.33, 0.38 | 2.20 m |
| kitchen | −1.44, 1.62 × 0.38, 5.38 | 2.20 m |

#### Plinths (added after the main build)

Added by `add_plinths.js` (run `node add_plinths.js` to regenerate; re-run it
after rebuilding the walls). Wooden skirting boards run along the foot of **the
whole house**: **6 cm tall, 1.5 cm proud of the wall face**. For each of the 56
wall boxes the script emits a collar box — the wall footprint expanded 1.5 cm on
all four sides, from z 0 to 0.06 m — so from either room the visible ledge is a
1.5 cm baseboard that automatically wraps every wall run, corner and doorway
jamb. It is procedural from the `walls` group, so it stays in sync if the walls
move, and it is idempotent (re-running replaces the previous `o plinths` block).

#### Window & sliding-door openings (added after the main build)

Added by `add_openings.js` (run `node add_openings.js` to regenerate; `--dry-run`
reports only). It carves axis-aligned holes out of the `walls` and `plinths`
sections — **no window/door leaf or glazing is added**, only the masonry holes.
Each opening is an axis-aligned void box; every wall box that overlaps it is
split into the surrounding pieces (sill below, lintel above, jambs on either
side) via a 6-slab box-subtraction, so the 90° invariant still holds
(`node move_vertices.js --audit` OK). Corner references below are OBJ vertex
numbers (`#N`, as shown by the Ctrl+D tool); metres in the OBJ frame.

| Opening | Wall | Run | Vertical |
|---|---|---|---|
| `window1` entrance | N-S, x 0.831–1.044 | 38 cm from #282 (y −8.497), 140 cm wide | 0.95 → 2.05 m |
| `window2` kitchen | E-W, y 5.272–5.485 | 74 cm west of #834 (x 1.719), 60 cm wide | 0.95 → 2.05 m |
| `window3` living | E-W, y 8.498–8.711 (full wall assembly) | 72 cm east of #1107 to 28 cm short of #844 | 0.95 → 2.05 m |
| `balcony_door` | N-S, x 1.491–1.704 | 30 cm from #834 to 16 cm from #1107 | 0 → 2.10 m |

All windows share a **95 cm sill and 110 cm height**; the sliding balcony door
runs floor → 210 cm. The pass is idempotent (re-running finds no overlap with
the already-cut holes).

The OBJ is Z-up in the file (`x` east, `y` north, `z` height); the browser
viewer (`index.html`) rotates −90° about X for Three.js, so its HUD shows
`world X = obj x`, `world Y = height`, `world Z = −obj y`. The user-supplied
walk-through coordinates were given in that HUD frame.

Block footprints in source units (x0, y0)–(x1, y1):
`wardrobe (-1440,1615)-(-810,1895)` · `bed1 (-1400,1005)-(-820,1475)` ·
`bed2 (-1400,2175)-(-1130,2720)` · `bath (-330,1995)-(-30,2730)` ·
`kitchen (-483,640)-(-395,1615)`.

Wall-strip extraction summary:
- `st0`/`st2`/`st8`-class strokes snapped to H/V; collinear merging (offset tol
  ±2 u, gap tol 15 u); pairing of parallel faces with thickness ∈
  {14.2, 28.3, 42.6} ± 3 u and ≥45 % span overlap; multi-pair allowed;
  stage-2 "half-pair" pass against *all* classes (catches walls whose inner
  face is drawn as `st6`, adds the 8.5 u glazing wall); strips extended
  ±0.8·thickness into junctions; deduped.
- 4 hand-added strips from measured linework: top glazing wall (2 pieces),
  living-room right exterior wall x 979–1021.5, bathroom window band
  x −21.7…−7.6, window jamb column x 111.3–125.4.
- Wall strips lying ≥85 % inside a placeholder block footprint were culled
  (no double geometry inside bath/kitchen/wardrobe).

#### Interactive vertex-deletion tool (viewer) + `remove_vertices.js`

The boxy OBJ inherits folds / doubled strips from the SVG linework. To prune
them without rebuilding the whole model, `index.html` and `viewer.html` (kept
identical) ship a deletion mode:

- **Ctrl+D** toggles it. A top banner and a centre crosshair appear; the vertex
  nearest the screen centre is highlighted by a magenta sphere (drawn with
  `depthTest:false`, so it shows through walls) and its OBJ index + XYZ are
  printed in the banner (`#N obj(x, y, z)`, metres, OBJ frame).
- **Left click** removes the highlighted vertex (and every face using it) and
  rebuilds the mesh live; **Ctrl+Z** undoes; **Ctrl+C** (or clicking the banner)
  copies the list of removed vertices in the format below.

Apply a copied list permanently with the Node script at the repo root:

```
node remove_vertices.js 91 90 122 ...        # explicit 1-based indices
node remove_vertices.js --file list.txt      # read a copied list / [..] block
node remove_vertices.js --dry-run 91 90      # report only, do not write
```

It removes the listed vertices, plus each one's **footprint-equivalent**
counterpart — the same `(x, y)` at the wall top (`z = 2.7`) and any true
`ceilings` vertex at the same plan position — then drops every face that used
them, prunes now-unused vertices, renumbers the face indices and refreshes the
header count. Options: `--tol <m>` (footprint tolerance, default 0.001),
`--keep-orphans`, `--out <path>`; it rewrites `floorplan.obj` in place by
default.

The first applied pass (indices below) removed 21 base corners + their 21
ceiling-height counterparts = **42 verts / 60 faces**, taking the model from
864/560 to **822/500**:

```
[91, 90, 122, 123, 593, 594, 578, 17, 577, 58, 50, 51, 66, 67, 602, 554, 129, 546, 545, 562, 561]
```

#### Wall-overlap cleanup + `clean_walls.js`

The strips were emitted one box each and overlapped heavily (junction
extensions, doubled linework, parallel runs): 989 box pairs intersected
volumetrically, so inner faces buried the real corners and the Ctrl+D tool
could not highlight them. `clean_walls.js` (Node, repo root) rebuilds the
`walls` section from the union of the box footprints:

```
node clean_walls.js                 # rewrite floorplan.obj in place
node clean_walls.js --dry-run       # report only
node clean_walls.js --minw 0.02     # drop fragments thinner than 2 cm
node clean_walls.js --out clean.obj # write elsewhere
```

It parses every valid wall box (6 faces / 8 verts / 2 distinct x, y, z), drops
the ~18 orphan scrap faces that never formed a box, splits each footprint at
the other boxes' edges, keeps each cell covered by the union once, merges cells
back into maximal rectangles, and re-emits them as fresh z 0→2.7 boxes. Other
sections (`floor`, `ceilings`, `block_*`) are only renumbered, never modified.
Result: **67 overlapping boxes → 56 disjoint boxes**, `walls` 336 faces, model
**672 verts / 416 faces**; `node move_vertices.js --audit` still reports every
edge axis-aligned (90°). Kept here so future geometry edits stay reproducible.

#### Floor texture & interior materials (viewer)

`floor_texture.jpg` (2048×2048) is a **seamless, evenly-lit CC0 wood-plank
diffuse map from Poly Haven** ("Wood Floor", https://polyhaven.com/a/wood_floor,
CC0 public domain), stored unmodified. It replaced the user-supplied photo,
whose baked-in lighting gradient could not be removed cleanly enough — any
residual repeated with every tile and read as a strong gradient while walking.

- Both `index.html` and `viewer.html` assign materials by OBJ group name:
  `floor` → `MeshStandardMaterial` (roughness **1.0**, no sheen) with the
  seamless map, planar UVs taken from the OBJ `x`/`y` metres
  (`u = x / 1.2`, `v = y / 1.2`, i.e. one tile ≈ 1.2 m so planks read at a
  realistic width) and plain `RepeatWrapping` (the map is already seamless);
  `walls` and `ceilings` → plain **white** `MeshStandardMaterial`; `plinths` →
  a wood-brown `MeshStandardMaterial` (matching the floor finish); the
  `block_*` placeholders stay light grey.
- The OBJ carries no normals, so the viewer now calls
  `computeVertexNormals()` (with `side: DoubleSide`, giving flat, correctly lit
  faces). The hemisphere light's ground colour was lightened and a soft
  ambient light added so the white walls/ceiling read as white rather than the
  previous dark blue-grey.

---

## 3. `floorplan_candidates/` — review artifacts

| File | Region kept (doc units) | Notes |
|---|---|---|
| `cand_A_full.svg/.png` | x [-2250, 1100], y [-110, 3550] | Plan **plus** the detached bed side-view floating left of the plan (Hab_Lucas detail at x=-2148…-1603) |
| `cand_B_core.svg/.png` | x [-1500, 1100], y [-110, 3550] | Plan with all furniture — **confirmed by user, basis of `floorplan.svg` and the OBJ** |
| `cand_C_walls.svg/.png` | x [-1500, 1100], y [-110, 3550], only `Capa_1` | Architectural linework only (walls/doors/windows/fixtures) — sole geometry source of the 3D model |
| `obj_iso.png` | — | Shaded isometric software render of `floorplan.obj` |
| `obj_view_top.png` | — | Axonometric wireframe render of the OBJ |

All candidate SVGs pruned with a mark-and-prune pass: an element survives iff
it or any descendant intersects the region; shared group structure and the
original `<style>` block are retained. (Note: these are serialized with
`ns0:` namespace prefixes — harmless for Inkscape/browsers.)

---

## 4. Pipeline scripts — `/tmp/kilo/plan/` (⚠ ephemeral, may be wiped on reboot)

| Script | Purpose | Inputs → outputs |
|---|---|---|
| `walk.py` | Parse original SVG, accumulate nested transforms, dump every geometry point per top-level layer | original SVG → `points.pkl` |
| `analyze.py` | First-pass layer scanner (regex depth-walk; superseded by `walk.py`) | → stdout |
| `cluster.py` | Grid binning (100 u) + connected components → distinct drawing regions | `points.pkl` → `comps.pkl` + region report |
| `grid.py` | Overview render + coordinate-grid overlay (localization of the plan) | `overview.png` → `overview_grid.png` |
| `prune.py` | Core extractor: path-data parser (`M/L/H/V/C/S/Q/T/A/Z`), transform parser (`translate/scale/rotate/matrix`), mark-and-prune candidate builder | source SVG + region list → `cand_*.svg` |
| `prune2.py` | Candidate generation incl. single-layer mode (walls-only) | → `cand_A_full/B_core/C_walls.svg` |
| `segs.py` | Segment extraction + orientation/length histogram (230 axis segments, 0 diagonal walls) | `cand_C_walls.svg` → `segs.pkl` |
| `analyze2.py`, `analyze3.py` | Class-role discovery and face-pair thickness statistics (the 14.2/28.3/42.6 modules) | → stdout |
| `solids.py` | First strip pairing (superseded) | → `strips.json` (v1) |
| `solids2.py` | **Final** strip extractor: merge → pair-multi → stage-2 half-pair → dedupe | `cand_C_walls.svg` → `strips.json` |
| `dbg.py` | Debug overlay renders (strips over plan) | `strips.json` → `dbg_overlay.svg/.png` |
| `regions.py` | Region re-renders with labeled 200-u grid for measuring rooms/fixtures | → `reg_*.svg/.png` |
| `final.py` | Builds candidate-B raw tree + stray hunt | → `final_raw.svg` |
| `tidy.py` | Stray removal + ink-bbox probe (first pass; scale bug fixed by re-probing `final_page.svg`) | → `floorplan.svg` |
| `build_obj.py` | **OBJ generator**: culling, manual strips, blocks, slab, transform to meters | `strips.json` → `floorplan.obj`, `final_boxes.json` |

`add_ceilings.js` (Node, lives in the repo root, not `/tmp`) appends the
`ceilings` group to `floorplan.obj` in place: `node add_ceilings.js`.
It is idempotent only against the freshly built OBJ, so re-run `build_obj.py`
first if regenerating from scratch.

`remove_vertices.js` (Node, repo root) applies a vertex-deletion list from the
viewer's Ctrl+D tool to `floorplan.obj` in place (see the section 2 write-up
for the exact behaviour and options).

`move_vertices.js` (Node, repo root) shifts axis-aligned vertex planes
(`--plane x|y from to`) to close gaps / align corners, and reports with
`--audit` whether every face edge stays parallel to an axis (the 90° check).

`clean_walls.js` (Node, repo root) rebuilds the `walls` section from the union
of the box footprints, removing overlapping/duplicated boxes (see section 2).

`add_plinths.js` (Node, repo root) appends the `plinths` group to
`floorplan.obj` in place: `node add_plinths.js`. It derives one 6 cm × 1.5 cm
baseboard collar per `walls` box, is idempotent (re-running replaces the block),
and should be re-run after any pass that rebuilds the walls.

`add_openings.js` (Node, repo root) carves the window / sliding-balcony-door
holes out of the `walls` + `plinths` sections in place (see the section 2
write-up): `node add_openings.js`. Run it after the walls are final; it is
idempotent and keeps all edges axis-aligned.

A shaded/wireframe OBJ previewer (pure PIL painter's algorithm) was run
inline (no script file) to produce `obj_iso.png` / `obj_view_*.png`.

### Intermediate data

| File | Contents |
|---|---|
| `points.pkl` | Transformed sample points per layer (for clustering) |
| `comps.pkl` | Connected components of the 100-u bin grid |
| `segs.pkl` | All axis-aligned segments of the walls layer |
| `strips.json` | 48 H + 30 V matched wall strips (+ unmatched runs, diagonals list) |
| `final_boxes.json` | The exact 86 boxes written into the OBJ `(x0, y0, x1, y1, h, z0, group)` |

### Debug / verification renders

`overview.png`, `overview_grid.png` (whole-file localization) ·
`cand_A_tight/B_wide_left/C_annex_only/D_full/E_probe .svg/.png`
(iterative bbox probes that located the plan's true extent) ·
`dbg_overlay.svg/.png`, `dbg_grid*.png` (strip-coverage checks) ·
`reg_bed1/ward/bed2/bath/kitchen .svg/.png`, `crop_*.png` (room measuring) ·
`final_probe*.png`, `final_verify.png`, `model_check.svg/.png`
(OBJ box footprints overlaid back onto the plan — final geometry QA) ·
`menu_probe.png`, `dbgwalls_plain.svg`, `full.svg` (scratch).

---

## 5. Coordinate systems

| Space | Definition |
|---|---|
| Doc units | Original SVG coordinates, y **down**. Plan occupies x ≈ [-1440, 1021.5], y ≈ [-44, 3444]. |
| `floorplan.svg` | Same doc coordinates; only the viewBox was set to the tight ink bbox. |
| OBJ | Meters: `X = (x − 209.25)·0.005` east, `Y` = height up, `Z = (1748.4 − y)·0.005` north (y-axis flipped so the plan reads correctly from above). |

---

## 6. Known limitations / next iteration hooks

- **Windows**: openings are now real holes cut in the walls (`add_openings.js`),
  95 cm sill / 110 cm high, plus the tall living-room band on the top wall. No
  frames or glazing yet — add those as a later pass. The balcony sliding door
  hole (floor → 210 cm) is also cut, but has no leaf/glass.
- **Doors**: not modeled; swing arcs in the drawing (`st1` curves) were
  dropped with the decoration classes.
- **Bathroom/kitchen/beds**: single coarse boxes by design.
- Balcony area: walls included, but its right wall relies on the hand-added
  strip at x 979–1021.5; verify against site if precision matters.
- A few 51-unit wall stubs (door-frame endcaps detected as short parallel
  pairs) survive as tiny boxes — harmless, cheap to delete from
  `final_boxes.json`/`build_obj.py` if unwanted.
- Regenerate everything with:
  `python3 /tmp/kilo/plan/solids2.py && python3 /tmp/kilo/plan/build_obj.py`
  (after re-creating the scripts from this document if `/tmp` was wiped).
