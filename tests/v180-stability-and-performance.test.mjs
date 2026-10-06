import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("ações administrativas sincronizam sem esconder toda a tela", async () => {
  const [owner, parkingData] = await Promise.all([
    read("app/components/OwnerWorkspace.tsx"),
    read("app/components/parking/useParkingData.ts"),
  ]);

  assert.match(owner, /const load = useCallback\(async \(quiet = false\)/);
  assert.match(owner, /if \(!quiet\) setLoading\(true\)/);
  assert.ok((owner.match(/await load\(true\)/g) || []).length >= 5);
  assert.match(parkingData, /const load = useCallback\(async \(quiet = false\)/);
  assert.match(parkingData, /if \(!quiet\) \{ setLoading\(true\)/);
  assert.match(parkingData, /sequence === sequenceRef.current/);
  assert.match(await read("app/components/parking/ParkingMemberPortal.tsx"), /loading && !data/);
});

test("reservas e limpezas evitam recarregar dados que já estão na tela", async () => {
  const parkingData = await read("app/components/parking/useParkingData.ts");
  const reservationFlow = parkingData.slice(
    parkingData.indexOf("async function createReservation"),
    parkingData.indexOf("async function reportAction"),
  );

  assert.match(reservationFlow, /await refreshReservations\(\)/);
  assert.match(reservationFlow, /current\.movimentacoes\.filter\(\(item\) => item\.status === "NO_LOCAL"\)/);
  assert.match(reservationFlow, /isCheckin\) await load\(true\)/);
});

test("tipos centrais de tenant e banco permanecem explícitos", async () => {
  const [tenant, cloudflare] = await Promise.all([
    read("app/lib/tenant.ts"),
    read("worker/cloudflare-types.d.ts"),
  ]);

  assert.match(tenant, /export type TenantPermissionResult/);
  assert.match(tenant, /Promise<TenantPermissionResult>/);
  assert.match(cloudflare, /interface D1Result<T = unknown>/);
  assert.match(cloudflare, /run<T = unknown>\(\): Promise<D1Result<T>>/);
});
