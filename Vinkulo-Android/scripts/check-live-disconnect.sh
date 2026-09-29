#!/usr/bin/env bash
set -euo pipefail

# Disposable CI emulator: start online, lose Wi-Fi and data while the app is
# open, inspect the local screen, and reconnect. The test leaves data offline.
mkdir -p app/build/reports/vinkulo-reader
adb install app/build/outputs/apk/debug/app-debug.apk
adb install app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
result=0
adb shell am instrument -w -r -e vinkulo.liveDisconnect 1 -e class com.vinkulo.app.NetworkTransitionTest \
  com.vinkulo.app.test/androidx.test.runner.AndroidJUnitRunner \
  | tee app/build/reports/vinkulo-reader/live-disconnect-test.txt || result=$?
adb pull /sdcard/vinkulo-reader-live-disconnect.png app/build/reports/vinkulo-reader/live-disconnect.png >/dev/null 2>&1 || true
adb pull /sdcard/vinkulo-reader-live-disconnect.xml app/build/reports/vinkulo-reader/live-disconnect.xml >/dev/null 2>&1 || true
adb pull /sdcard/vinkulo-reader-reconnect-failure.png app/build/reports/vinkulo-reader/reconnect-failure.png >/dev/null 2>&1 || true
adb pull /sdcard/vinkulo-reader-reconnect-failure.xml app/build/reports/vinkulo-reader/reconnect-failure.xml >/dev/null 2>&1 || true
grep -q 'OK (1 test)' app/build/reports/vinkulo-reader/live-disconnect-test.txt || result=1
test -s app/build/reports/vinkulo-reader/live-disconnect.png || result=1
test -s app/build/reports/vinkulo-reader/live-disconnect.xml || result=1
if grep -Eq 'FAILURES|INSTRUMENTATION_FAILED|Process crashed' app/build/reports/vinkulo-reader/live-disconnect-test.txt; then result=1; fi
test "$result" -eq 0
adb uninstall com.vinkulo.app.test
adb uninstall com.vinkulo.app
