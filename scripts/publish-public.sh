#!/usr/bin/env bash
# Publishes a fresh snapshot of Wonderloop to the public repository (viking916/wonderloop-open):
# builds the scrubbed tree with scripts/export-public.mjs, makes it a single commit, and replaces
# the public main branch with it. History never leaves the private repository.
#
#   bash scripts/publish-public.sh            # from the ai-teaches folder, with HEAD committed
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
out="${TMPDIR:-/tmp}/wonderloop-public-export"
node "$here/scripts/export-public.mjs" "$out"
cd "$out"
git init -q -b main
git add -A
git -c user.name="Vivek" -c user.email="vvp916@gmail.com" commit -q -m "Wonderloop, public snapshot ($(date +%Y-%m-%d))

Snapshot of the private working repository. Code MIT, curriculum CC BY-NC-SA 4.0."
git remote add origin https://github.com/viking916/wonderloop-open.git
git push --force origin main
echo "Published to https://github.com/viking916/wonderloop-open"
