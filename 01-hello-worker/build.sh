#!/bin/bash
# build.sh - Build the Hello Worker WASM module

set -e

echo "🦀 Building Hello Worker to WebAssembly..."
echo ""

# Check if wasm-pack is installed
if ! command -v wasm-pack &> /dev/null; then
    echo "❌ wasm-pack is not installed!"
    echo ""
    echo "Install it with:"
    echo "  cargo install wasm-pack"
    exit 1
fi

# Build with wasm-pack targeting web
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
