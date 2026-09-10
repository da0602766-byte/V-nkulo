import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const orchestrator = await readFile(new URL("../app/components/ParkingWorkspace.tsx", import.meta.url), "utf8");
const memberPortal = await readFile(new URL("../app/components/parking/ParkingMemberPortal.tsx", import.meta.url), "utf8");
const migration = await readFile(new URL("../drizzle/0052_parking_vehicle_details.sql", import.meta.url), "utf8");

// V2026 — o painel de estacionamento foi totalmente redesenhado como
// "Gestão": em vez de duas árvores JSX pré-renderizadas e alternadas por CSS
// (`.parking-desktop-shell { display:none }` abaixo de 680px), a escolha de
// experiência (membro, operador em plantão no celular ou console de gestão)
// agora acontece uma única vez em JavaScript, via matchMedia.
test("a experiência de celular é escolhida em JavaScript, não por CSS oculto", () => {
  assert.match(orchestrator, /matchMedia\(MOBILE_QUERY\)/);
  assert.match(orchestrator, /\(max-width: 900px\)/);
  assert.match(orchestrator, /showOperatorMobile/);
});

test("a reserva do membro continua coletando os dados do usuário e do veículo", () => {
  assert.match(memberPortal, /Seus dados/);
  assert.match(memberPortal, /Veículo/);
  assert.match(memberPortal, /placaVeiculo/);
  assert.match(memberPortal, /modeloVeiculo/);
  assert.match(memberPortal, /corVeiculo/);
});

test("vehicle details are durable fields in parking reservations", () => {
  assert.match(migration, /placa_veiculo/);
  assert.match(migration, /tipo_veiculo/);
  assert.match(migration, /modelo_veiculo/);
  assert.match(migration, /cor_veiculo/);
});
