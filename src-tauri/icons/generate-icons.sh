#!/bin/bash

# High-quality icon generation from commander.svg
# Prevents quality loss with proper ImageMagick settings

if [ ! -f "commander.svg" ]; then
    echo "❌ Error: commander.svg not found in current directory"
    exit 1
fi

echo "🎨 Generating high-quality icons from commander.svg..."

# Ultra high-quality settings for crisp icons
DENSITY="-density 600"  # Double density for sharper rendering
BACKGROUND="-background transparent"
QUALITY="-quality 100"
ANTIALIAS="-antialias"
COLORSPACE="-colorspace sRGB"  # Proper color management
FILTER="-filter Lanczos"  # High-quality resize algorithm
UNSHARP="-unsharp 0x0.75+0.75+0.008"  # Sharpen after resize

# Ensure 8-bit RGBA output (Tauri/Tao expects 8-bit per channel)
# Without this, ImageMagick may emit 16-bit PNGs, causing a runtime panic:
# "invalid icon: The specified dimensions (WxH) don't match the number of pixels supplied by the rgba argument"
BITDEPTH="-depth 8 -type TrueColorAlpha -define png:color-type=6"

# Generate all required PNG sizes
echo "📐 Generating PNG icons..."

magick commander.svg $DENSITY $BACKGROUND $COLORSPACE $ANTIALIAS $QUALITY $FILTER $BITDEPTH -resize 30x30 $UNSHARP Square30x30Logo.png
magick commander.svg $DENSITY $BACKGROUND $COLORSPACE $ANTIALIAS $QUALITY $FILTER $BITDEPTH -resize 32x32 $UNSHARP 32x32.png
magick commander.svg $DENSITY $BACKGROUND $COLORSPACE $ANTIALIAS $QUALITY $FILTER $BITDEPTH -resize 44x44 $UNSHARP Square44x44Logo.png
magick commander.svg $DENSITY $BACKGROUND $COLORSPACE $ANTIALIAS $QUALITY $FILTER $BITDEPTH -resize 71x71 $UNSHARP Square71x71Logo.png
magick commander.svg $DENSITY $BACKGROUND $COLORSPACE $ANTIALIAS $QUALITY $FILTER $BITDEPTH -resize 89x89 $UNSHARP Square89x89Logo.png
magick commander.svg $DENSITY $BACKGROUND $COLORSPACE $ANTIALIAS $QUALITY $FILTER $BITDEPTH -resize 107x107 $UNSHARP Square107x107Logo.png
magick commander.svg $DENSITY $BACKGROUND $COLORSPACE $ANTIALIAS $QUALITY $FILTER $BITDEPTH -resize 128x128 $UNSHARP 128x128.png
magick commander.svg $DENSITY $BACKGROUND $COLORSPACE $ANTIALIAS $QUALITY $FILTER $BITDEPTH -resize 142x142 $UNSHARP Square142x142Logo.png
magick commander.svg $DENSITY $BACKGROUND $COLORSPACE $ANTIALIAS $QUALITY $FILTER $BITDEPTH -resize 150x150 $UNSHARP Square150x150Logo.png
magick commander.svg $DENSITY $BACKGROUND $COLORSPACE $ANTIALIAS $QUALITY $FILTER $BITDEPTH -resize 256x256 $UNSHARP 128x128@2x.png
magick commander.svg $DENSITY $BACKGROUND $COLORSPACE $ANTIALIAS $QUALITY $FILTER $BITDEPTH -resize 284x284 $UNSHARP Square284x284Logo.png
magick commander.svg $DENSITY $BACKGROUND $COLORSPACE $ANTIALIAS $QUALITY $FILTER $BITDEPTH -resize 310x310 $UNSHARP Square310x310Logo.png
magick commander.svg $DENSITY $BACKGROUND $COLORSPACE $ANTIALIAS $QUALITY $FILTER $BITDEPTH -resize 512x512 $UNSHARP icon.png
magick commander.svg $DENSITY $BACKGROUND $COLORSPACE $ANTIALIAS $QUALITY $FILTER $BITDEPTH -resize 256x256 $UNSHARP StoreLogo.png

echo "🖼️  Generating platform-specific formats..."

# Generate ICO for Windows (multiple sizes in one file)
magick commander.svg $DENSITY $BACKGROUND $COLORSPACE $ANTIALIAS $QUALITY $FILTER $BITDEPTH \
    \( -clone 0 -resize 16x16 $UNSHARP \) \
    \( -clone 0 -resize 32x32 $UNSHARP \) \
    \( -clone 0 -resize 48x48 $UNSHARP \) \
    \( -clone 0 -resize 256x256 $UNSHARP \) \
    -delete 0 icon.ico

# Generate ICNS for macOS with maximum quality
echo "🍎 Creating macOS ICNS with all required sizes..."

# Create iconset directory structure (Apple's preferred method)
rm -rf commander.iconset
mkdir -p commander.iconset

# Generate all required sizes for iconset
magick commander.svg $DENSITY $BACKGROUND $COLORSPACE $ANTIALIAS $QUALITY $FILTER $BITDEPTH -resize 16x16 $UNSHARP commander.iconset/icon_16x16.png
magick commander.svg $DENSITY $BACKGROUND $COLORSPACE $ANTIALIAS $QUALITY $FILTER $BITDEPTH -resize 32x32 $UNSHARP commander.iconset/icon_16x16@2x.png
magick commander.svg $DENSITY $BACKGROUND $COLORSPACE $ANTIALIAS $QUALITY $FILTER $BITDEPTH -resize 32x32 $UNSHARP commander.iconset/icon_32x32.png
magick commander.svg $DENSITY $BACKGROUND $COLORSPACE $ANTIALIAS $QUALITY $FILTER $BITDEPTH -resize 64x64 $UNSHARP commander.iconset/icon_32x32@2x.png
magick commander.svg $DENSITY $BACKGROUND $COLORSPACE $ANTIALIAS $QUALITY $FILTER $BITDEPTH -resize 128x128 $UNSHARP commander.iconset/icon_128x128.png
magick commander.svg $DENSITY $BACKGROUND $COLORSPACE $ANTIALIAS $QUALITY $FILTER $BITDEPTH -resize 256x256 $UNSHARP commander.iconset/icon_128x128@2x.png
magick commander.svg $DENSITY $BACKGROUND $COLORSPACE $ANTIALIAS $QUALITY $FILTER $BITDEPTH -resize 256x256 $UNSHARP commander.iconset/icon_256x256.png
magick commander.svg $DENSITY $BACKGROUND $COLORSPACE $ANTIALIAS $QUALITY $FILTER $BITDEPTH -resize 512x512 $UNSHARP commander.iconset/icon_256x256@2x.png
magick commander.svg $DENSITY $BACKGROUND $COLORSPACE $ANTIALIAS $QUALITY $FILTER $BITDEPTH -resize 512x512 $UNSHARP commander.iconset/icon_512x512.png
magick commander.svg $DENSITY $BACKGROUND $COLORSPACE $ANTIALIAS $QUALITY $FILTER $BITDEPTH -resize 1024x1024 $UNSHARP commander.iconset/icon_512x512@2x.png

# Convert iconset to ICNS using Apple's iconutil (best quality)
iconutil -c icns commander.iconset

# Clean up iconset directory
rm -rf commander.iconset

# Fallback: check if png2icns is available
if [ ! -f "icon.icns" ] && command -v png2icns &> /dev/null; then
    echo "🔄 Fallback: Using png2icns..."
    magick commander.svg $DENSITY $BACKGROUND $COLORSPACE $ANTIALIAS $QUALITY $FILTER $BITDEPTH -resize 1024x1024 $UNSHARP temp_1024.png
    png2icns icon.icns temp_1024.png
    rm temp_1024.png
fi

# Final fallback: use libicns png2icns if available
if [ ! -f "icon.icns" ] && command -v /opt/homebrew/bin/png2icns &> /dev/null; then
    echo "🔄 Fallback: Using libicns png2icns..."
    magick commander.svg $DENSITY $BACKGROUND $COLORSPACE $ANTIALIAS $QUALITY $FILTER $BITDEPTH -resize 1024x1024 $UNSHARP temp_1024.png
    /opt/homebrew/bin/png2icns icon.icns temp_1024.png
    rm temp_1024.png
fi

echo "✅ Icon generation complete!"
echo "📋 Generated files:"
ls -la *.png *.ico *.icns | grep -v commander.svg

echo ""
echo "🚀 Ready to build your Tauri app with new icons!"
