#!/bin/bash

# Clean up generated icon files while preserving commander.svg and backup/ folder
echo "Cleaning up generated icon files..."

# Remove all PNG files
rm -f *.png

# Remove platform-specific formats
rm -f *.ico *.icns

echo "✅ Cleanup complete! Preserved commander.svg and backup/ folder."
echo "Ready for fresh icon generation."