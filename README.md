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

### `floorplan.obj` (25,674 bytes) — boxy low-fi 3D model

Generated **only from `Capa_1` linework** (black furniture ignored per plan;
kitchen/bath/bed areas coarse-blocked per instruction, iterate later).

- Units: **meters**, Y-up, Z-north, model centered on plan center.
- Scale: **1 SVG unit = 5 mm** (`S = 0.005`) — calibrated against bed length
  (~1.8 m), counter depth (~44 cm), fridge width (~68 cm), wall thicknesses.
- Wall thickness modules found in the drawing: **14.2 / 28.3 / 42.6 units**
  (= 7 / 14 / 21 cm) plus a thin 8.5-unit glazing wall (4 cm).
- Geometry: 86 axis-aligned boxes = 688 verts / 516 quads. Extents
  X [-6.30, 6.15], Y [-8.88, 8.87], Z [-0.05, 2.70].

Groups:

| Group | Boxes | Contents | Height |
|---|---|---|---|
| `walls` | 80 | All wall strips: exterior ~21 cm, interior ~14 cm, thin ~4 cm, balcony walls. Window/door openings left as **gaps** for the later windows pass. | 2.70 m |
| `floor` | 1 | Full footprint slab 12.45 m × 17.75 m | 0.05 m (z −0.05→0) |
| `block_bed1` | 1 | Master bed placeholder, footprint 2.9 × 2.35 m | 0.55 m |
| `block_bed2` | 1 | Lucas bed placeholder, 1.35 × 2.7 m | 0.55 m |
| `block_wardrobe` | 1 | Closet band, 3.15 × 1.4 m | 2.30 m |
| `block_bath` | 1 | Whole bathroom block (fixtures inside) | 0.90 m |
| `block_kitchen` | 1 | Kitchen counter band, 0.44 × 4.9 m | 0.90 m |

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

- **Windows**: openings are wall *gaps*; windows must be added later (the
  geometry deliberately leaves those gaps clean, including the tall living-room
  glazing band on the top and right walls).
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
