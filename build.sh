#!/bin/bash
set -e

echo "🏗️  Building DigBahi Frontend for Production..."

# Install dependencies (if needed)
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm ci
fi

# Run build
echo "⚡ Running Vite Build..."
npm run build

echo "✅ Build complete. Output directory: dist/"
echo "   To serve: python3 -m http.server 5173 --directory dist"
