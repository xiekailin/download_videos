#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"
node "$SCRIPT_DIR/scripts/build-windows-online-source.mjs"

echo
echo "打包完成，ZIP 位于：$SCRIPT_DIR/dist/HD-Video-Downloader-Windows-Online.zip"
