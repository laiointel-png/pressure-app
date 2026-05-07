#!/usr/bin/env bash
set -euo pipefail

echo "== Pressure verify =="

node scripts/verify.mjs

if command -v python3 >/dev/null 2>&1; then
  python3 - <<'PY'
import glob
import os
import py_compile
import tempfile

tmpdir = tempfile.mkdtemp(prefix="pressure-pyc-")
for filename in glob.glob("backend/*.py"):
    cfile = os.path.join(tmpdir, os.path.basename(filename) + "c")
    py_compile.compile(filename, cfile=cfile, doraise=True)
print("OK: python syntax checks passed")
PY
fi

echo "OK"
