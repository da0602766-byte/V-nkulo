import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

// Trava de isolamento entre comunidades.
//
// Auditoria de 08/09/2026 (Etapa 11 do script de otimização) percorreu as 113
// rotas e não encontrou IDOR: toda consulta que endereça um registro de uma
// tabela por comunidade ou filtra por `comunidade_id`, ou é precedida por uma
// verificação de posse na mesma requisição, ou pertence a um endpoint de
// escopo global do proprietário.
//
// Este teste existe para que isso continue verdade sem depender de alguém
// repetir a auditoria. Ele falha quando uma rota nova endereça um registro de
// tabela por comunidade com `id = ?` sem filtrar `comunidade_id` na mesma
// consulta. Se a rota nova for uma exceção legítima, ela precisa entrar na
// lista abaixo com o motivo escrito — o custo é deliberado: a exceção fica
// registrada em vez de passar despercebida.

const raiz = new URL("../", import.meta.url);

// Exceções conferidas uma a uma na auditoria. O motivo é parte da trava: quem
// adicionar uma linha aqui precisa dizer por que é segura.
const EXCECOES = new Map([
  [
    "app/api/pilot/estacionamento/relatorios/route.ts",
    "A posse é verificada logo antes, no SELECT com r.id = ? AND r.comunidade_id = ?, que devolve 404 quando o relatório é de outra comunidade.",
  ],
  [
    "app/api/pilot/editorial/route.ts",
    "Endpoint de escopo global: exige platform.admin.view, e o proprietário administra os rascunhos de todas as comunidades.",
  ],
  [
    "app/api/pilot/editorial/programacoes/route.ts",
    "Mesmo escopo global do editorial, sob platform.admin.view.",
  ],
  [
    "app/api/pilot/cadastros-membros/route.ts",
    "Escopo por dono do recurso: as consultas filtram por criado_por = ?, restringindo a pessoa aos próprios links de cadastro.",
  ],
  [
    "app/api/pilot/convites/aceitar/route.ts",
    "O convite é resgatado por token de uso único; o vínculo de comunidade vem do próprio convite, não da sessão.",
  ],
  [
    "app/api/pilot/redes/route.ts",
    "Escopo por rede, que é o dono real do recurso: a unidade é carregada com id = ? AND rede_id = ?, depois de canManageNetwork(redeId), e uma rede abrange várias comunidades por desenho.",
  ],
  [
    "app/api/pilot/continuidade/route.ts",
    "Fluxo de ciclo de comunidade, decidido pelo proprietário sobre qualquer comunidade.",
  ],
]);

async function listarRotas(diretorio) {
  const encontrados = [];
  for (const entrada of await readdir(new URL(diretorio, raiz), { withFileTypes: true })) {
    const caminho = `${diretorio}${entrada.name}`;
    if (entrada.isDirectory()) encontrados.push(...(await listarRotas(`${caminho}/`)));
    else if (entrada.name === "route.ts") encontrados.push(caminho);
  }
  return encontrados;
}

async function tabelasPorComunidade() {
  const tabelas = new Set();
  const arquivos = (await readdir(new URL("drizzle/", raiz))).filter((nome) =>
    nome.endsWith(".sql"),
  );
  for (const nome of arquivos) {
    const src = await readFile(new URL(`drizzle/${nome}`, raiz), "utf8");
    for (const bloco of src.matchAll(/CREATE TABLE `([a-z_]+)` \(([\s\S]*?)\n\);/g)) {
      if (/`comunidade_id`/.test(bloco[2])) tabelas.add(bloco[1]);
    }
  }
  return tabelas;
}

test("nenhuma rota endereça registro de comunidade por id sem filtrar comunidade", async () => {
  const tabelas = await tabelasPorComunidade();
  assert.ok(
    tabelas.size > 40,
    "a leitura do schema falhou: sem a lista de tabelas a trava não verifica nada",
  );

  const rotas = await listarRotas("app/api/pilot/");
  assert.ok(rotas.length > 50, "a varredura de rotas falhou");

  const suspeitas = [];
  for (const rota of rotas) {
    const src = await readFile(new URL(rota, raiz), "utf8");
    for (const literal of src.matchAll(/`([^`]*)`/g)) {
      const consulta = literal[1];
      if (!/\b(SELECT|UPDATE|DELETE\s+FROM|INSERT\s+INTO)\b/i.test(consulta)) continue;
      if (!/\b(WHERE|AND)\s+[\w.]*\bid\s*=\s*\?/i.test(consulta)) continue;
      if (/comunidade_id/i.test(consulta)) continue;
      const alvos = [...consulta.matchAll(/\b(?:FROM|INTO|UPDATE|JOIN)\s+([a-z_]+)/gi)]
        .map((item) => item[1])
        .filter((nome) => tabelas.has(nome));
      if (!alvos.length) continue;
      suspeitas.push({ rota, alvos: [...new Set(alvos)], consulta: consulta.split(/\s+/).join(" ").slice(0, 120) });
    }
  }

  const novas = suspeitas.filter((item) => !EXCECOES.has(item.rota));
  assert.deepEqual(
    novas.map((item) => `${item.rota} -> ${item.alvos.join(", ")}: ${item.consulta}`),
    [],
    "rota endereçando registro de tabela por comunidade sem filtrar comunidade_id. Adicione o filtro na consulta ou registre a exceção com motivo em EXCECOES.",
  );

  // Uma exceção que deixou de ser necessária deve sair da lista, senão ela vira
  // uma permissão silenciosa para uma rota futura no mesmo arquivo.
  const usadas = new Set(suspeitas.map((item) => item.rota));
  const obsoletas = [...EXCECOES.keys()].filter((rota) => !usadas.has(rota));
  assert.deepEqual(
    obsoletas,
    [],
    "exceção listada que não corresponde mais a nenhuma consulta: remova a entrada de EXCECOES",
  );
});
