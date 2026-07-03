"""Remove vectors by id from a user's FAISS index (called on document delete).

Usage:
  python remove.py --index <index_path> --ids 1,2,3

Emits JSON on stdout: {"ok": true, "removed": N}
"""
import argparse
import json
import os
import sys

import numpy as np
import faiss


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--index", required=True)
    ap.add_argument("--ids", required=True)
    args = ap.parse_args()

    if not os.path.exists(args.index):
        print(json.dumps({"ok": True, "removed": 0}))
        return

    ids = [int(x) for x in args.ids.split(",") if x.strip()]
    if not ids:
        print(json.dumps({"ok": True, "removed": 0}))
        return

    index = faiss.read_index(args.index)
    removed = index.remove_ids(np.array(ids, dtype="int64"))
    # Write-to-temp + atomic rename so readers never see a partial index.
    tmp = args.index + ".tmp"
    faiss.write_index(index, tmp)
    os.replace(tmp, args.index)
    print(json.dumps({"ok": True, "removed": int(removed)}))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(1)
