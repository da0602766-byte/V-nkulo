#!/usr/bin/env bash
set -euo pipefail
mkdir -p app/build/reports
ready=0
# Cold WebView initialization on shared CI runners has variable latency.
# Wait for usable content, not an arbitrary 3-second screenshot. This is a
# functional timeout, not a performance measurement or relaxed assertion.
for attempt in $(seq 1 12); do
  adb shell uiautomator dump /sdcard/vinkulo-foundation.xml >/dev/null 2>&1 || true
  adb pull /sdcard/vinkulo-foundation.xml app/build/reports/vinkulo-release-offline.xml >/dev/null 2>&1 || true
  # A WebView too old for the protected bridge uses a separate native screen,
  # not the HTML dashboard. Verify each surface against its own expected UI.
  if { grep -Fq 'O que vamos fazer?' app/build/reports/vinkulo-release-offline.xml &&
       grep -Fq 'Preparação necessária' app/build/reports/vinkulo-release-offline.xml; } ||
     { grep -Fq 'Seu espaço salvo' app/build/reports/vinkulo-release-offline.xml &&
       grep -Fq 'Sem acesso à internet' app/build/reports/vinkulo-release-offline.xml; }; then
    ready=1
    break
  fi
  sleep 2
done
# Accessibility can become ready before the emulator compositor presents the
# WebView frame. Retain an additional settled capture for human visual review.
sleep 5
adb shell screencap -p /sdcard/vinkulo-offline.png
adb pull /sdcard/vinkulo-offline.png app/build/reports/vinkulo-release-offline.png
sleep 3
adb shell screencap -p /sdcard/vinkulo-offline-settled.png
adb pull /sdcard/vinkulo-offline-settled.png app/build/reports/vinkulo-release-offline-settled.png
adb logcat -d -t 1500 > app/build/reports/vinkulo-release-logcat.txt || echo 'Optional logcat capture unavailable'
adb shell dumpsys webviewupdate > app/build/reports/vinkulo-release-webview.txt || echo 'Optional WebView diagnostic unavailable'
test "$ready" = 1
