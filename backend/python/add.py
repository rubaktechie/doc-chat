"""Add pre-computed embedding vectors to a user's FAISS index.

Usage:
  python add.py --index <index_path> --embed-model <name>

Reads JSON from stdin (Node computes the embeddings):
  {"vectors": [[...], [...], ...]}

This script owns the FAISS index and its metadata sidecar: it normalizes the
vectors, assigns sequential ids, and enforces that an index stays fixed to one
dimension / embed model.

Emits a single JSON object on stdout:
  {"ok": true, "dim": N, "faiss_ids": [12, 13, ...]}
or {"ok": false, "error": "..."} with a non-zero exit code.
"""
import argparse
import json
import os
import sys

import numpy as np
import faiss


def meta_path_for(index_path):
    return index_path + ".meta.json"


def load_meta(index_path):
    p = meta_path_for(index_path)
    if os.path.exists(p):
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"next_id": 1, "dim": None, "embed_model": None}


def save_meta(index_path, meta):
    # Write-to-temp + atomic rename: a crash mid-write must never leave a
    # truncated meta file behind.
    p = meta_path_for(index_path)
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(meta, f)
    os.replace(tmp, p)


def load_or_create_index(index_path, dim):
    if os.path.exists(index_path):
        return faiss.read_index(index_path)
    base = faiss.IndexFlatIP(dim)
    return faiss.IndexIDMap2(base)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--index", required=True)
    ap.add_argument("--embed-model", required=True)
    args = ap.parse_args()

    payload = json.load(sys.stdin)
    vectors = payload.get("vectors") or []
    if not vectors:
        print(json.dumps({"ok": True, "dim": 0, "faiss_ids": []}))
        return

    arr = np.array(vectors, dtype="float32")
    dim = arr.shape[1]
    faiss.normalize_L2(arr)  # cosine similarity via inner product

    # Guard: an existing index is fixed-dimension and tied to one embed model.
    meta = load_meta(args.index)
    if meta.get("dim") not in (None, dim):
        raise RuntimeError(
            f"Embedding dimension mismatch: index expects {meta['dim']} but this "
            f"model produced {dim}. Re-index this collection to switch embedding models."
        )
    if meta.get("embed_model") not in (None, args.embed_model):
        raise RuntimeError(
            f"Embedding model mismatch: index built with '{meta['embed_model']}' but "
            f"current model is '{args.embed_model}'. Re-index to switch embedding models."
        )

    # Assign ids and add to the index.
    index = load_or_create_index(args.index, dim)
    start_id = int(meta.get("next_id", 1))
    ids = np.arange(start_id, start_id + len(vectors), dtype="int64")
    index.add_with_ids(arr, ids)
    # Same write-to-temp + atomic rename for the index itself: readers either
    # see the old complete index or the new one, never a partial file.
    tmp = args.index + ".tmp"
    faiss.write_index(index, tmp)
    os.replace(tmp, args.index)

    meta["next_id"] = start_id + len(vectors)
    meta["dim"] = dim
    meta["embed_model"] = args.embed_model
    save_meta(args.index, meta)

    print(json.dumps({"ok": True, "dim": dim, "faiss_ids": [int(x) for x in ids]}))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(1)
