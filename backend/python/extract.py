"""Extract a document's text with markitdown (any format -> plain text).

Usage:
  python extract.py --file <path>

Emits a single JSON object on stdout:
  {"ok": true, "text": "..."}
or {"ok": false, "error": "..."} with a non-zero exit code.

Chunking and embedding happen in Node; this script only does extraction.
"""
import argparse
import json
import sys

from markitdown import MarkItDown


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", required=True)
    args = ap.parse_args()

    md = MarkItDown()
    result = md.convert(args.file)
    print(json.dumps({"ok": True, "text": result.text_content or ""}))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(1)
