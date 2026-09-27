#!/usr/bin/env bash
set -euo pipefail
result=0
gradle connectedDebugAndroidTest || result=$?
mkdir -p app/build/reports/vinkulo-reader
for name in mural agenda escalas recreated visitors foundation-failure reader-failure; do
  for extension in png xml; do
    adb pull "/sdcard/vinkulo-reader-$name.$extension" "app/build/reports/vinkulo-reader/$name.$extension" >/dev/null 2>&1 || true
  done
done
if [ "$result" -eq 0 ] && [ "${1:-0}" -ge 35 ]; then
  for name in mural agenda escalas recreated visitors; do
    test -s "app/build/reports/vinkulo-reader/$name.png" || result=1
    test -s "app/build/reports/vinkulo-reader/$name.xml" || result=1
  done
fi
exit "$result"
