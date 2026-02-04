#!/bin/bash
set -e

echo "🦀 Building Task Worker to WebAssembly..."

# Build with wasm-pack
wasm-pack build --target web --out-dir www/pkg --release

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
