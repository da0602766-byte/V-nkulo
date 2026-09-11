import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("visitor registration is a continuous form with every section visible", async () => {
  const operations = await read("app/components/TenantOperations.tsx");
  const styles = await read("app/globals.css");
  const registration = operations.slice(
    operations.indexOf('<form className="pilot-form visitor-registration"'),
    operations.indexOf('<section className="visitor-relations-v2"'),
  );

  assert.doesNotMatch(registration, /<details className="visitor-registration-section"/);
  assert.equal((registration.match(/visitor-registration-form-section/g) || []).length, 4);
  assert.match(styles, /\.visitor-registration-form-section>fieldset\s*\{\s*display:grid!important/);
});

test("the next ministry schedule displays its automatic publication countdown", async () => {
  const ministries = await read("app/components/SecretaryMinisterialWorkspace.tsx");
  const compact = ministries.slice(
    ministries.indexOf("function ScheduleCompact"),
    ministries.indexOf("function LinkBuilder"),
  );

  assert.match(compact, /schedule\.status === "AGENDADA"/);
  assert.match(compact, /SchedulePublicationCountdown opensAt=\{schedule\.publicar_em\}/);
  assert.match(ministries, /Liberação automática em/);
});

test("mobile cells and navigation use the final compact dock cascade", async () => {
  const dashboard = await read("app/components/PilotDashboard.tsx");
  const styles = await read("app/globals.css");
  const finalCascade = styles.slice(styles.lastIndexOf("Final modal safeguards"));

  assert.match(dashboard, /className="pilot-mobile-nav-icon"/);
  assert.match(styles, /\.pilot-mobile-nav\s*\{[^}]*border-radius:20px/s);
  assert.match(finalCascade, /\.cell-detail-overlay-v2 \.cell-tabs-v2\s*\{[^}]*overflow-x:auto!important/s);
  assert.match(finalCascade, /\.cell-detail-overlay-v2 \.cell-tabs-v2 ~ section\s*\{[^}]*overflow-y:auto!important/s);
});
