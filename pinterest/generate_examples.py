#!/usr/bin/env python3
"""Generate example carousels: generic + UofT + Queen's + McGill."""

import subprocess
import sys

TOPIC = "how to save money as a student"

RUNS = [
    {"label": "generic", "args": [TOPIC]},
    {"label": "UofT", "args": [TOPIC, "--school", "uoft"]},
    {"label": "Queen's", "args": [TOPIC, "--school", "queens"]},
    {"label": "McGill", "args": [TOPIC, "--school", "mcgill"]},
]


def main():
    for run in RUNS:
        print(f"\n{'='*60}")
        print(f"  Generating: {run['label']}")
        print(f"{'='*60}")
        result = subprocess.run(
            [sys.executable, "slidegen.py"] + run["args"],
            cwd=sys.path[0] or ".",
        )
        if result.returncode != 0:
            print(f"  FAILED: {run['label']}", file=sys.stderr)


if __name__ == "__main__":
    main()
