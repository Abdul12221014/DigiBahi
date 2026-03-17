#!/bin/bash

# DigBahi Application Stop Script

echo "🛑 Stopping DigBahi Application..."

# Stop services on specific ports
lsof -ti:5173,8000,9000 2>/dev/null | xargs kill -9 2>/dev/null || true

# Stop any related processes
ps aux | grep -E "(vite|uvicorn|npm.*dev|python.*main)" | grep -v grep | awk '{print $2}' | xargs kill -9 2>/dev/null || true

sleep 1

echo "✅ All services stopped."

