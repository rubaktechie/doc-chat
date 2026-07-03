"""Search a user's FAISS index with a pre-computed query vector.

Usage:
  python query.py --index <index_path> --k 5

Reads JSON from stdin (Node computes the embedding):
  {"vector": [...]}

Emits JSON on stdout:
  {"ok": true, "results": [{"faiss_id": 12, "score": 0.83}, ...]}
or {"ok": false, "error": "..."}.
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
    ap.add_argument("--k", type=int, default=5)
    args = ap.parse_args()

    if not os.path.exists(args.index):
        print(json.dumps({"ok": True, "results": []}))
        return

    index = faiss.read_index(args.index)
    if index.ntotal == 0:
        print(json.dumps({"ok": True, "results": []}))
        return

    payload = json.load(sys.stdin)
    vector = payload.get("vector")
    if not vector:
        print(json.dumps({"ok": True, "results": []}))
        return

    arr = np.array([vector], dtype="float32")
    faiss.normalize_L2(arr)

    k = min(args.k, index.ntotal)
    scores, ids = index.search(arr, k)

    results = []
    for score, fid in zip(scores[0], ids[0]):
        if fid == -1:
            continue
        results.append({"faiss_id": int(fid), "score": float(score)})

    print(json.dumps({"ok": True, "results": results}))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(1)
