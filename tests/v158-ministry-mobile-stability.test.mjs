import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workspace = await readFile(
  new URL("../app/components/SecretaryMinisterialWorkspace.tsx", import.meta.url),
  "utf8",
);
const styles = await readFile(
  new URL("../app/secretary.css", import.meta.url),
  "utf8",
);

test("schedule creator remains controlled while its fields rerender", () => {
  assert.match(workspace, /const \[scheduleCreatorOpen, setScheduleCreatorOpen\] = useState\(false\)/);
  assert.match(workspace, /open=\{scheduleCreatorOpen\}/);
  assert.match(workspace, /onToggle=\{\(event\) => \{/);
  assert.doesNotMatch(workspace, /scheduleDetails\.current\.open\s*=/);
});

test("ministry detail uses a single mobile hero column and non-clipped tabs", () => {
  assert.match(styles, /\.pilot-dashboard\[data-ui-version="v2"\] \.secretary-workspace \.secretary-hero\.has-banner\{/);
  assert.match(styles, /display:grid!important;\s*grid-template-columns:minmax\(0,1fr\)!important;/);
  assert.match(styles, /\.secretary-tabs\{[\s\S]*?grid-template-columns:repeat\(4,minmax\(0,1fr\)\);[\s\S]*?overflow:visible;/);
});
