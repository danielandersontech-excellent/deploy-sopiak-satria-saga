#!/bin/bash
# ============================================
# PTSSS Mobile — APK Build Script
# Runs inside Docker container
# ============================================
set -e

echo "=========================================="
echo "  PTSSS Mobile APK Builder"
echo "=========================================="

# Step 1: Update API URL if provided.
# Mobile reads its production API URL from app.json's extra.apiUrl
# field (see src/lib/apiClient.ts). Patch that, not the source.
if [ -n "$API_URL" ]; then
    echo "[1/5] Updating API URL to: $API_URL"
    node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync('app.json','utf8'));j.expo.extra=j.expo.extra||{};j.expo.extra.apiUrl=process.env.API_URL;fs.writeFileSync('app.json',JSON.stringify(j,null,2));"
    echo "      ✅ app.json.extra.apiUrl updated"
else
    echo "[1/5] Using app.json default API URL"
fi

# Step 2: Expo prebuild (generate android/ folder)
echo "[2/5] Running expo prebuild..."
npx expo prebuild --platform android --clean
echo "      ✅ Android project generated"

# Step 3: Fix permissions
echo "[3/5] Setting Gradle permissions..."
cd android
chmod +x gradlew

# Step 4: Build APK
echo "[4/5] Building APK (this may take 10-20 minutes)..."
./gradlew assembleRelease \
    --no-daemon \
    --warning-mode=all \
    -Dorg.gradle.jvmargs="-Xmx2048m -XX:MaxMetaspaceSize=512m"

# Step 5: Copy APK to output
echo "[5/5] Copying APK to output..."
APK_PATH=$(find . -name "*.apk" -path "*/release/*" | head -1)

if [ -n "$APK_PATH" ]; then
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    OUTPUT_NAME="ptsss-v$(node -p "require('../package.json').version")-${TIMESTAMP}.apk"
    cp "$APK_PATH" "/output/${OUTPUT_NAME}"
    echo ""
    echo "=========================================="
    echo "  ✅ BUILD SUKSES!"
    echo "  APK: /output/${OUTPUT_NAME}"
    echo "  Size: $(du -h "/output/${OUTPUT_NAME}" | cut -f1)"
    echo "=========================================="
else
    echo "❌ APK not found! Build may have failed."
    echo "Searching for any APK files..."
    find . -name "*.apk" -type f
    exit 1
fi