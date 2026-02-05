#!/bin/bash
set -e
wasm-pack build --target web --out-dir web/pkg
echo "Build complete. Serve with: cd web && python3 -m http.server 8080"
