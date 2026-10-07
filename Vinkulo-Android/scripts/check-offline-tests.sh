#!/usr/bin/env bash
set -euo pipefail
result=0
./gradlew --dependency-verification strict connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.notClass=com.vinkulo.app.UpgradeContinuityTest || result=$?
mkdir -p app/build/reports/vinkulo-reader
for name in notifications mural agenda escalas requests recreated reader-restored reader-cleared visitors visitors-draft foundation-failure reader-failure module-failure module-requests module-notes module-followups module-checklists module-cells module-parking module-form-requests module-form-notes module-form-followups module-form-checklists module-form-cells module-form-parking pending-review usability-large-text-keyboard; do
  for extension in png xml; do
    adb pull "/sdcard/vinkulo-reader-$name.$extension" "app/build/reports/vinkulo-reader/$name.$extension" >/dev/null 2>&1 || true
  done
done
adb pull "/sdcard/vinkulo-reader-usability-performance.json" "app/build/reports/vinkulo-reader/usability-performance.json" >/dev/null 2>&1 || true
if [ "$result" -eq 0 ] && [ "${1:-0}" -ge 35 ]; then
  for name in notifications mural agenda escalas requests recreated reader-restored reader-cleared visitors visitors-draft module-requests module-notes module-followups module-checklists module-cells module-parking module-form-requests module-form-notes module-form-followups module-form-checklists module-form-cells module-form-parking pending-review usability-large-text-keyboard; do
    test -s "app/build/reports/vinkulo-reader/$name.png" || result=1
    test -s "app/build/reports/vinkulo-reader/$name.xml" || result=1
  done
  test -s "app/build/reports/vinkulo-reader/usability-performance.json" || result=1
fi
exit "$result"
