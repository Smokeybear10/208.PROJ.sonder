"""Quick APS round-trip: build a small scene (ground + cars + assets + EV charger), upload it to
Autodesk, translate to SVF2, and print the resulting model URN.

No PDAL / no LiDAR needed - this proves the Autodesk path and shows the charger end to end. The
real demo scene comes from run.py on a real Cyvl tile; this is the no-creds-blocker proof + a
demo-safety fallback scene. Reads APS creds from cad/.env.

    cd cad && python bake_demo.py
"""
import os
import zipfile

from pipeline.to_cad import (
    mesh_box, write_obj, write_mtl, car_objects, asset_objects, ev_station_objects,
)
from aps.auth import get_token
from aps.upload import ensure_bucket, upload_object
from aps.translate import start_translation, wait_until_done

BUCKET = os.environ.get("SONDER_BUCKET", "sonder_cad_kfe48gvs9qzn1wsa")  # globally-unique, lowercase
OBJECT_KEY = os.environ.get("SONDER_OBJECT_KEY", "sonder_scene_v1.zip")   # bump per re-bake


def build_scene():
    objs = []
    # flat ground slab so nothing floats
    gv, gf = mesh_box((6, 0, -0.05), (44, 30, 0.1))
    objs.append({"name": "ground", "material": "asphalt", "verts": gv, "faces": gf})
    objs += car_objects([
        {"center": (2, -4, 0.75), "length": 4.5, "width": 1.8, "height": 1.5, "yaw": 0.0},
        {"center": (9, -4, 0.75), "length": 4.5, "width": 1.8, "height": 1.5, "yaw": 0.0},
    ])
    objs += asset_objects([
        {"type": "UTILITY_POLE", "x": 6, "y": 4, "ground_z": 0, "height": 7},
        {"type": "TREE", "x": 13, "y": 4, "ground_z": 0, "height": 6},
        {"type": "HYDRANT", "x": -2, "y": 3, "ground_z": 0, "height": 0.9},
    ])
    objs += ev_station_objects([{"x": 5.5, "y": 3.0, "ground_z": 0.0, "yaw": 0.0}])
    return objs


def main():
    os.makedirs("out", exist_ok=True)
    objs = build_scene()
    write_mtl("out/scene.mtl")
    write_obj("out/scene.obj", objs, mtl_filename="scene.mtl")
    print(f"scene.obj: {len(objs)} objects (incl. ev_station_01)")

    with zipfile.ZipFile("out/scene_cad.zip", "w", zipfile.ZIP_DEFLATED) as z:
        z.write("out/scene.obj", "scene.obj")
        z.write("out/scene.mtl", "scene.mtl")

    tok = get_token()
    ensure_bucket(tok, BUCKET)
    print(f"bucket: {BUCKET}")
    urn = upload_object(tok, BUCKET, OBJECT_KEY, "out/scene_cad.zip")
    print(f"uploaded {OBJECT_KEY}")
    start_translation(tok, urn, root_filename="scene.obj")
    print("translating (SVF2)...")
    wait_until_done(tok, urn)
    print("\n=== DONE ===")
    print("URN:", urn)


if __name__ == "__main__":
    main()
