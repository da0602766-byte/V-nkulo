#!/usr/bin/env bash
set -euo pipefail
# Disposable CI emulator only. Previous and current DEBUG apps use the same debug
# certificate; signed RELEASE update continuity is checked separately in the workflow.
previous="${1:?previous debug APK required}"
mkdir -p app/build/reports/vinkulo-upgrade
adb install "$previous"
adb install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb shell dumpsys package com.vinkulo.app | grep firstInstallTime > app/build/reports/vinkulo-upgrade/before.txt
run_case() {
  adb shell am instrument -w -r -e class "com.vinkulo.app.UpgradeContinuityTest#$1" com.vinkulo.app.test/androidx.test.runner.AndroidJUnitRunner | tee "app/build/reports/vinkulo-upgrade/$2.txt"
  grep -q 'OK (1 test)' "app/build/reports/vinkulo-upgrade/$2.txt"
  ! grep -Eq 'FAILURES|INSTRUMENTATION_FAILED|Process crashed' "app/build/reports/vinkulo-upgrade/$2.txt"
}
run_case seedPreviousVersion seed
adb shell am force-stop com.vinkulo.app
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell dumpsys package com.vinkulo.app | grep firstInstallTime > app/build/reports/vinkulo-upgrade/after.txt
diff app/build/reports/vinkulo-upgrade/before.txt app/build/reports/vinkulo-upgrade/after.txt
run_case verifyUpdatedVersionAndRecovery updated
adb shell am force-stop com.vinkulo.app
run_case verifyUpdatedVersionAndRecovery reopened
# Only discard fixtures after the continuity assertions above have passed.
adb uninstall com.vinkulo.app.test
adb uninstall com.vinkulo.app
