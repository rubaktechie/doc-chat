"""Search a user's FAISS index with a pre-computed query vector.

Usage:
  python query.py --index <index_path> --k 5

Reads JSON from stdin (Node computes the embedding):
  {"vector": [...], "allowed_ids": [12, 13, ...]}

"allowed_ids" is optional: when present, results are restricted to those
faiss ids (used to scope a chat to specific documents). The index is exact
brute-force (IndexFlatIP), so we search the full index and post-filter —
same cost as a top-k search, and it avoids depending on the IDSelector
search-params API, which isn't exposed in every faiss build.

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

    allowed = payload.get("allowed_ids")
    k = min(args.k, index.ntotal)
    # With a filter we need the full ranking before dropping disallowed ids,
    # or the top-k could be entirely consumed by out-of-scope vectors.
    search_k = index.ntotal if allowed else k
    scores, ids = index.search(arr, search_k)

    allowed_set = set(allowed) if allowed else None
    results = []
    for score, fid in zip(scores[0], ids[0]):
        if fid == -1:
            continue
        if allowed_set is not None and int(fid) not in allowed_set:
            continue
        results.append({"faiss_id": int(fid), "score": float(score)})
        if len(results) >= k:
            break

    print(json.dumps({"ok": True, "results": results}))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(1)
