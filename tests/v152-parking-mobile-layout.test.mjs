import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const component = await readFile(new URL("../app/components/ParkingWorkspace.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const migration = await readFile(new URL("../drizzle/0052_parking_vehicle_details.sql", import.meta.url), "utf8");

test("mobile parking follows the compact four-step reservation flow", () => {
  assert.match(component, /01 \/ LOCAL/);
  assert.match(component, /02 \/ VAGA/);
  assert.match(component, /03 \/ CONFIRMAÇÃO/);
  assert.match(component, /DADOS DO USUÁRIO/);
  assert.match(component, /DADOS DO VEÍCULO/);
  assert.match(component, /placaVeiculo/);
  assert.match(component, /modeloVeiculo/);
  assert.match(component, /corVeiculo/);
  assert.match(styles, /@media \(max-width:680px\)/);
  assert.match(styles, /\.parking-desktop-shell \{ display:none!important; \}/);
});

test("vehicle details are durable fields in parking reservations", () => {
  assert.match(migration, /placa_veiculo/);
  assert.match(migration, /tipo_veiculo/);
  assert.match(migration, /modelo_veiculo/);
  assert.match(migration, /cor_veiculo/);
});
