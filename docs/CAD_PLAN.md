# CAD / Autodesk integration plan

How Sonder uses Xavier's point-cloud-to-CAD tool (`xavier-cyvl/hackathonBuckets`) as our Autodesk
sponsor path and the demo's closing beat. (Read "VAD" in the ask as CAD.)

The pitch beat this powers (PLAN.md §8): after the swarm picks the winning curb, we open the
reconstructed block in the Autodesk Viewer and **drop an EV charging station at the measured
curb** — a real, editable CAD scene from the same Cyvl scan. "Same engine, any scanned street."

## 1. What the tool already does

Xavier's pipeline turns one Cyvl LiDAR tile into an editable Autodesk Viewer scene:

- crop an 80 m ROI → PDAL SMRF ground → road/sidewalk from drive paths
- detect parked cars (height band + DBSCAN + PCA boxes)
- lift Cyvl 2D detections (trees, poles, hydrants, manholes, signals) to 3D by coordinate
- extrude OSM building footprints to point-measured heights
- write a multi-object **OBJ + MTL**, zip it, push through **Autodesk APS** (OSS upload →
  Model Derivative SVF2 → Viewer)
- in the Viewer, every object is a selectable node — **move / delete / hide already work**

The key fact for us: each object is an OBJ `o <name>` group, which Model Derivative turns into an
individually selectable, movable node with zero extra metadata. So adding a placeable EV station
is just adding one named object.

## 2. The Sonder → CAD handoff (the only new contract)

The swarm already produces the winner. CAD consumes a tiny handoff:

```json
{
  "site_id": "seg_001",
  "lon": -71.1221, "lat": 42.3966,      // winning curb point
  "bearing": 41.0,                       // street heading, to orient the station
  "usable_frontage_ft": 22.5,            // from Max; how much curb we have
  "verdict": "go"
}
```

That is a subset of our `Verdict` plus the site's `lon/lat/bearing`. CAD uses it to (a) pick the
LiDAR tile + ROI center for that location and (b) place the EV station at the curb.

## 3. The feature: place a car / EV station curbside

Two layers, both small:

### 3a. Seed the station at the measured curb (pipeline side)
Add an EV-station parametric model alongside the existing tree/pole/hydrant models in
`pipeline/to_cad.py`, and place it at the winner's coordinate in `run.py`. The viewer then makes
it movable for free.

New generator in `to_cad.py` (same primitives as the rest):

```python
def ev_station_objects(stations):
    """stations: [{x, y, ground_z, yaw}]. Pedestal + screen + a stub charge post."""
    objs = []
    for i, s in enumerate(stations, 1):
        x, y, z0, yaw = s["x"], s["y"], s["ground_z"], s.get("yaw", 0.0)
        nm = f"ev_station_{i:02d}"
        bv, bf = mesh_box((x, y, z0 + 0.6), (0.5, 0.3, 1.2), yaw)          # pedestal
        objs.append({"name": nm, "material": "pole", "verts": bv, "faces": bf})
        sv, sf = mesh_box((x, y, z0 + 1.25), (0.45, 0.08, 0.35), yaw)       # screen/head
        objs.append({"name": nm + "_screen", "material": "signal", "verts": sv, "faces": sf})
    return objs
```

Add an `"ev_green": (0.10, 0.55, 0.30)` material to `MATERIALS` + `write_mtl` if we want it to
read as a charger. (Object names must have no spaces — keep the `ev_station_01` convention.)

Place it in `run.py` (after assets are lifted and shifted to local origin):

```python
# Sonder winner -> EV station at the curb
from pyproj import Transformer
import numpy as np
win = json.load(open(os.environ["SONDER_WINNER"]))          # the handoff json above
tx = Transformer.from_crs(4326, crs, always_xy=True)
wx, wy = tx.transform(win["lon"], win["lat"])               # winner UTM
gz = ground_ds[cKDTree(ground_ds[:, :2]).query([wx, wy])[1], 2]   # ground elevation there
stations = [{"x": wx - ox, "y": wy - oy, "ground_z": gz, "yaw": math.radians(win.get("bearing", 0))}]
objs = ground_objs + bld_objs + car_objects(cars) + asset_objects(assets) + ev_station_objects(stations)
```

And aim the crop at the winner so the tile is right: set `ROI_CX=wx ROI_CY=wy` (run.py already
honors these) and pick the tile with `pipeline/select_tiles.py` for the winner's coordinate.

### 3b. Click-to-place in the viewer (stretch, the "yk place a car wherever" part)
The viewer already moves a selected object via fragment proxies. To let the user *place* a new
station by clicking the street:
- raycast the click to a ground point (the viewer gives world coords),
- clone the `ev_station` node to that position (or pre-load a few hidden stations and `show` +
  move one on click).
This is a viewer-side addition in `viewer/viewer.js` next to the existing move/delete handlers.
Same trick works to drop a car anywhere. Treat as a stretch; 3a alone makes the demo.

## 4. How to incorporate the repo

Keep Xavier's repo intact; don't copy code into ours. Recommended:

- Clone it as a sibling: `~/Documents/Projects/hackathonBuckets`.
- In Sonder, after the swarm picks the winner, write the handoff json (§2) to a file and call the
  CAD pipeline with `SONDER_WINNER=that.json ROI_CX/ROI_CY=winner UTM`.
- Optionally add it as a git submodule under `cad/` if we want it versioned with Sonder. Submodule
  keeps Xavier's history separate and gives him credit.

Our only code is the ~15-line bridge in §3a (the EV-station model + the placement block), which we
contribute back to his repo since he wanted us to use it.

## 5. Setup / credentials

- Python 3.11 venv; `pip install -r requirements.txt`. **PDAL** must come from conda
  (`conda install -c conda-forge pdal python-pdal`) — it fails on pip/macOS.
- `.env` (gitignored) needs `APS_CLIENT_ID` / `APS_CLIENT_SECRET` (Autodesk app credentials,
  separate from the Anthropic key). Get them from the APS developer portal.
- The bundled browser viewer and token server have been removed. The CAD pipeline still
  exports OBJ/MTL and can upload and translate models through APS.
- Data: pull the winner's LAZ tile + `pavements_v2`, `aboveGroundAssets_v2`,
  `streetviewImagePaths_v2` from the `cyvl-hackathon` S3 bucket (anonymous works).

## 6. Demo scope and safety

The full pipeline (110M-point PDAL crop → APS translate) will **not** run reliably live. Do what
Xavier did and what PLAN.md §7 says: **pre-bake one winning site** as an artifact.

- Pre-run the pipeline for the selected block, upload it, and save the translated model URN.
  Bump the object key each re-bake (`scene_cad_vN.zip`) to avoid a stale cached model.
- The original demo used the bundled browser viewer. That frontend has been removed;
  the generated model and its URN can still be consumed by an Autodesk client.

## 7. Why this scores

- **Autodesk sponsor check (real, load-bearing):** real APS APIs (Auth v2, OSS, Model Derivative,
  Viewer SDK) on real Cyvl LiDAR. Not bolted on — it is the output of the whole pipeline.
- **Two sponsors, woven:** NVIDIA (SAM3 + detector in Max's perception) + Autodesk (this). That is
  the cap; we skip Ask Boston.
- **Not a Google Maps clone:** an editable 3D CAD reconstruction with a placeable charger and real
  measurements is something no map tool produces.

## 8. Risks (from Xavier's honest notes)

- APS Viewer has no native point cloud; the raw cloud is a three.js overlay (visual only). Fine for
  us — the editable objects are the OBJ scene.
- Street-side scan sees facades only; buildings are extruded footprints, car detection is heuristic.
  Our EV station is placed from the swapped-in winner coordinate, so it is exact regardless.
- SVF2 caching: version the object key every re-bake.
- PDAL install is the main setup hazard; use conda and do it first.

## 9. Build order (when we get to it)

1. Sibling-clone the repo, get APS creds in `.env`, prove the dummy round-trip
   (`write_dummy_scene()` → upload → translate → viewer).
2. Add `ev_station_objects` + the `MATERIALS` entry; re-run the dummy with a station to see it in
   the viewer, selectable and movable.
3. Pick the demo winner; pull its tile + vectors; run `run.py` with `SONDER_WINNER` + ROI center.
4. Wire the swarm winner → handoff json (a few lines in our `service.py`).
5. Pre-bake, paste the URN, rehearse the cut from swarm → viewer.
6. (Stretch) viewer click-to-place for a car / station.
