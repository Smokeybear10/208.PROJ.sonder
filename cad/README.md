# Cyvl × Autodesk | Point-Cloud Street Segmenter

Classify a LiDAR street segment, generate an OBJ/MTL model, and translate it through Autodesk APS.

The bundled browser viewers and token servers have been removed. The model pipeline, APS integration, and tested coordinate-adjustment utilities remain.

## Setup

Use Python 3.11 and install the dependencies in `requirements.txt`. PDAL requires native libraries; on macOS, install it through conda with `conda install -c conda-forge pdal python-pdal`.

Set `APS_CLIENT_ID` and `APS_CLIENT_SECRET` in a local `.env` file for uploads and translations. Set `LAZ_DIR` to the directory containing the source point-cloud tiles. These credentials and large datasets are not committed.

## Run

From `cad/`, generate a small example scene and upload it for APS translation:

```bash
python bake_demo.py
```

This writes `out/scene.obj`, `out/scene.mtl`, and `out/scene_cad.zip`, then prints the translated model URN.

For a real scene:

1. Download the tile manifest, select tiles with `python -m pipeline.select_tiles pointclouds_v2.geojson`, and place the LAZ files in `LAZ_DIR`.
2. Put the `pavements_v2`, `aboveGroundAssets_v2`, and `streetviewImagePaths_v2` GeoJSON layers in `data/`.
3. Run `python run.py` to classify the point cloud, export the model, upload it, and print its APS URN.
4. Run `python export_points.py` to write the aligned colored point cloud to `out/points.bin`.

`SONDER_SITE` optionally points to a site-handoff JSON file with the selected charger's location. `ROI_CX`, `ROI_CY`, and `ROI_M` select the region of interest.

## Checks

```bash
python -m pytest tests/ -q
node --test viewer/adjust.test.js
```

The tests use synthetic fixtures and do not require PDAL or source LiDAR tiles. Writing `out/classified.laz` in the full pipeline requires the LAZ backend supplied by `laspy[laz]`.
