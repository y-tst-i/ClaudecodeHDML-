#!/bin/sh
# run every self-test (needs numpy, scipy, Pillow)
set -e
cd "$(dirname "$0")"
python3 -I fit_stairs.py --selftest
python3 -I foot_correct.py selftest
python3 -I camera.py hfov --focal-mm 35
