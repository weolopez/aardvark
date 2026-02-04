#!/bin/bash
# build.sh - Build the GitHub Worker WASM module

set -e

echo "🦀 Building GitHub Worker to WebAssembly..."
echo ""

if ! command -v wasm-pack &> /dev/null; then
    echo "❌ wasm-pack is not installed!"
    echo ""
    echo "Install it with:"
    echo "  cargo install wasm-pack"
    exit 1
fi

wasm-pack build --target web --out-dir www/pkg

echo ""
echo "✅ Build complete!"
echo ""
echo "📁 Generated files in www/pkg/:"
ls -la www/pkg/
echo ""
echo "🚀 To run the demo:"
echo ""
echo "   cd www && python3 -m http.server 8080"
echo ""
echo "   Then open: http://localhost:8080"
