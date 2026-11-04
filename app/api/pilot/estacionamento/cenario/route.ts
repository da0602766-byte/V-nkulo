import { getD1 } from "../../../../../db";
import { requireTenantPermission } from "../../../../lib/tenant";
import {
  parseParkingScene,
  sceneIssues,
  seedParkingScene,
  type ParkingScene,
  type SceneSpace,
} from "../../../../lib/parking-scene";

// Structural fingerprint excludes occupation, so normal arrivals do not discard a draft.
const fingerprintSql = `SELECT json_object('v',json((SELECT json_group_array(json_object('id',id,'codigo',codigo,'tipo',tipo,'setor',setor_id,'ativo',ativo,'x',posicao_x,'y',posicao_y)) FROM (SELECT * FROM estacionamento_vagas WHERE comunidade_id=? ORDER BY id))), 's',json((SELECT json_group_array(json_object('id',id,'nome',nome,'cor',cor,'ativo',ativo)) FROM (SELECT * FROM estacionamento_setores WHERE comunidade_id=? ORDER BY id)))) AS fingerprint`;
async function readSceneData(community: number) {
  const db = getD1();
  const [row, spaces, sectors, fp] = await Promise.all([
    db
      .prepare("SELECT * FROM estacionamento_cenas WHERE comunidade_id=?")
      .bind(community)
      .first<{
        revisao: number;
        rascunho: string | null;
        publicada: string | null;
      }>(),
    db
      .prepare(
        "SELECT v.*,s.nome AS setor_nome,s.cor AS setor_cor FROM estacionamento_vagas v JOIN estacionamento_setores s ON s.id=v.setor_id WHERE v.comunidade_id=?",
      )
      .bind(community)
      .all<SceneSpace & { ativo: number }>(),
    db
      .prepare(
        "SELECT id,nome,cor,ativo,scene_key FROM estacionamento_setores WHERE comunidade_id=?",
      )
      .bind(community)
      .all<{
        id: number;
        nome: string;
        cor: string;
        ativo: number;
        scene_key: string | null;
      }>(),
    db
      .prepare(fingerprintSql)
      .bind(community, community)
      .first<{ fingerprint: string }>(),
  ]);
  const hydrate = (raw: string): ParkingScene => {
    const s = parseParkingScene(JSON.parse(raw));
    return {
      ...s,
      sectors: s.sectors.map((t) => ({
        ...t,
        dbId: t.dbId || sectors.results.find((r) => r.scene_key === t.id)?.id,
      })),
      objects: s.objects.map((o) =>
        o.kind === "space"
          ? {
              ...o,
              spaceId:
                o.spaceId ||
                spaces.results.find((r) => r.scene_key === o.id)?.id,
            }
          : o,
      ),
    };
  };
  return {
    row,
    spaces: spaces.results,
    sectors: sectors.results,
    fingerprint: fp!.fingerprint,
    hydrate,
  };
}
export async function GET(request: Request) {
  const editor = new URL(request.url).searchParams.get("editor") === "1";
  const access = await requireTenantPermission(
    editor ? "parking.configure" : "parking.reserve",
  );
  if ("error" in access) return access.error;
  const community = access.context.comunidadeId,
    db = getD1();
  const config = await db
    .prepare(
      "SELECT ativo FROM estacionamento_configuracoes WHERE comunidade_id=?",
    )
    .bind(community)
    .first<{ ativo: number }>();
  if (!config?.ativo)
    return Response.json(
      { error: "Estacionamento desativado." },
      { status: 423 },
    );
  const data = await readSceneData(community);
  const published = data.row?.publicada
    ? data.hydrate(data.row.publicada)
    : null;
  const history = editor
    ? await db
        .prepare(
          "SELECT id,revisao,criado_em FROM estacionamento_cenas_historico WHERE comunidade_id=? ORDER BY id DESC LIMIT 20",
        )
        .bind(community)
        .all()
    : null;
  const historyId = Number(new URL(request.url).searchParams.get("history"));
  let restored: ParkingScene | null = null;
  if (editor && historyId) {
    const entry = await db
      .prepare(
        "SELECT cena FROM estacionamento_cenas_historico WHERE comunidade_id=? AND id=?",
      )
      .bind(community, historyId)
      .first<{ cena: string }>();
    if (!entry)
      return Response.json(
        { error: "Versão não encontrada." },
        { status: 404 },
      );
    restored = data.hydrate(entry.cena);
  }
  return Response.json(
    {
      revision: data.row?.revisao || 0,
      published,
      ...(editor
        ? {
            draft:
              restored ||
              (data.row?.rascunho
                ? data.hydrate(data.row.rascunho)
                : published) ||
              seedParkingScene(
                data.spaces.filter((s) => s.ativo),
                data.sectors.filter((s) => s.ativo),
              ),
            fingerprint: data.fingerprint,
            history: history?.results || [],
          }
        : {}),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function PUT(request: Request) {
  const access = await requireTenantPermission("parking.configure");
  if ("error" in access) return access.error;
  const db = getD1(),
    community = access.context.comunidadeId;
  const config = await db
    .prepare(
      "SELECT ativo FROM estacionamento_configuracoes WHERE comunidade_id=?",
    )
    .bind(community)
    .first<{ ativo: number }>();
  if (!config?.ativo)
    return Response.json(
      { error: "Estacionamento desativado." },
      { status: 423 },
    );
  let payload: {
    scene?: unknown;
    revision?: number;
    fingerprint?: string;
    publish?: boolean;
  };
  let scene: ParkingScene;
  try {
    const raw = await request.text();
    if (raw.length > 750000)
      throw new Error("O cenário excede o tamanho permitido.");
    payload = JSON.parse(raw);
    scene = parseParkingScene(payload.scene);
    if (
      !Number.isSafeInteger(payload.revision) ||
      Number(payload.revision) < 0 ||
      typeof payload.fingerprint !== "string" ||
      typeof payload.publish !== "boolean"
    )
      throw new Error("Recarregue o editor antes de salvar.");
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
  const current = await readSceneData(community);
  if (
    (current.row?.revisao || 0) !== payload.revision ||
    current.fingerprint !== payload.fingerprint
  )
    return Response.json(
      {
        error:
          "O mapa mudou em outra sessão. Recarregue antes de salvar; suas alterações continuam abertas.",
      },
      { status: 409 },
    );
  if (
    scene.sectors.some(
      (s) => s.dbId && !current.sectors.some((t) => t.id === s.dbId),
    ) ||
    scene.objects.some(
      (o) => o.spaceId && !current.spaces.some((s) => s.id === o.spaceId),
    )
  )
    return Response.json(
      { error: "Referência de vaga ou setor inválida." },
      { status: 400 },
    );
  // Resolve IDs for objects created by an earlier publish, even on a retried request.
  try {
    scene = parseParkingScene(current.hydrate(JSON.stringify(scene)));
  } catch {
    return Response.json(
      { error: "Vínculos de vagas ou setores repetidos." },
      { status: 400 },
    );
  }
  const problems = sceneIssues(scene);
  if (payload.publish && problems.length)
    return Response.json({ error: problems.join(" ") }, { status: 400 });
  const json = JSON.stringify(scene),
    token = crypto.randomUUID();
  const allowed = `EXISTS(SELECT 1 FROM estacionamento_cenas WHERE comunidade_id=${community} AND token=?)`;
  // The predicate and all mutations run in one D1 transaction. Reservations/entries
  // created after opening the draft are checked here, not just in the browser.
  const protectedGuard = `NOT EXISTS(SELECT 1 FROM estacionamento_vagas v WHERE v.comunidade_id=? AND
    (v.status='OCUPADA' OR EXISTS(SELECT 1 FROM estacionamento_movimentacoes m WHERE m.comunidade_id=v.comunidade_id AND m.vaga_id=v.id AND m.status='NO_LOCAL') OR EXISTS(SELECT 1 FROM estacionamento_reservas r WHERE r.comunidade_id=v.comunidade_id AND r.vaga_id=v.id AND r.status IN ('PENDENTE','CONFIRMADA') AND datetime(r.fim_em)>datetime('now')))
    AND NOT EXISTS(SELECT 1 FROM json_each(?,'$.objects') o JOIN json_each(?,'$.sectors') s ON json_extract(s.value,'$.id')=json_extract(o.value,'$.sectorId') WHERE json_extract(o.value,'$.kind')='space' AND json_extract(o.value,'$.spaceId')=v.id AND json_extract(o.value,'$.spaceType')=v.tipo AND json_extract(s.value,'$.dbId')=v.setor_id))`;
  const statements = [
    db
      .prepare(
        "INSERT INTO estacionamento_cenas(comunidade_id) VALUES(?) ON CONFLICT DO NOTHING",
      )
      .bind(community),
  ];
  statements.push(
    db
      .prepare(
        `UPDATE estacionamento_cenas SET rascunho=?,publicada=CASE WHEN ? THEN ? ELSE publicada END,revisao=revisao+1,token=?,atualizado_por=?,atualizado_em=CURRENT_TIMESTAMP WHERE comunidade_id=? AND revisao=? AND (${fingerprintSql})=? ${payload.publish ? `AND ${protectedGuard}` : ""} RETURNING revisao`,
      )
      .bind(
        json,
        payload.publish ? 1 : 0,
        json,
        token,
        access.user.id,
        community,
        payload.revision,
        community,
        community,
        payload.fingerprint,
        ...(payload.publish ? [community, json, json] : []),
      ),
  );
  if (payload.publish) {
    statements.push(
      db
        .prepare(
          `INSERT INTO estacionamento_setores(comunidade_id,nome,cor,ordem,scene_key) SELECT ?,json_extract(value,'$.name'),json_extract(value,'$.color'),CAST(key AS INTEGER),json_extract(value,'$.id') FROM json_each(?,'$.sectors') WHERE json_extract(value,'$.dbId') IS NULL AND ${allowed}`,
        )
        .bind(community, json, token),
    );
    statements.push(
      db
        .prepare(
          `UPDATE estacionamento_setores SET ativo=0 WHERE comunidade_id=? AND ${allowed}`,
        )
        .bind(community, token),
    );
    statements.push(
      db
        .prepare(
          `UPDATE estacionamento_setores SET nome=(SELECT json_extract(value,'$.name') FROM json_each(?,'$.sectors') WHERE json_extract(value,'$.dbId')=estacionamento_setores.id OR json_extract(value,'$.id')=estacionamento_setores.scene_key),cor=(SELECT json_extract(value,'$.color') FROM json_each(?,'$.sectors') WHERE json_extract(value,'$.dbId')=estacionamento_setores.id OR json_extract(value,'$.id')=estacionamento_setores.scene_key),ativo=1 WHERE comunidade_id=? AND ${allowed} AND EXISTS(SELECT 1 FROM json_each(?,'$.sectors') WHERE json_extract(value,'$.dbId')=estacionamento_setores.id OR json_extract(value,'$.id')=estacionamento_setores.scene_key)`,
        )
        .bind(json, json, community, token, json),
    );
    const sectorLookup = `(SELECT id FROM estacionamento_setores WHERE comunidade_id=${community} AND (id=json_extract(s.value,'$.dbId') OR scene_key=json_extract(s.value,'$.id')) LIMIT 1)`;
    statements.push(
      db
        .prepare(
          `INSERT INTO estacionamento_vagas(comunidade_id,setor_id,codigo,tipo,posicao_x,posicao_y,scene_key) SELECT ?,${sectorLookup},json_extract(o.value,'$.name'),json_extract(o.value,'$.spaceType'),CAST(json_extract(o.value,'$.x')*7 AS INTEGER),CAST(json_extract(o.value,'$.y')*7 AS INTEGER),json_extract(o.value,'$.id') FROM json_each(?,'$.objects') o JOIN json_each(?,'$.sectors') s ON json_extract(s.value,'$.id')=json_extract(o.value,'$.sectorId') WHERE json_extract(o.value,'$.kind')='space' AND json_extract(o.value,'$.spaceId') IS NULL AND ${allowed}`,
        )
        .bind(community, json, json, token),
    );
    statements.push(
      db
        .prepare(
          `UPDATE estacionamento_vagas SET ativo=0 WHERE comunidade_id=? AND ${allowed}`,
        )
        .bind(community, token),
    );
    statements.push(
      db
        .prepare(
          `WITH input AS (SELECT o.value AS obj,${sectorLookup} AS sector FROM json_each(?,'$.objects') o JOIN json_each(?,'$.sectors') s ON json_extract(s.value,'$.id')=json_extract(o.value,'$.sectorId') WHERE json_extract(o.value,'$.kind')='space') UPDATE estacionamento_vagas SET
      codigo=(SELECT json_extract(obj,'$.name') FROM input WHERE json_extract(obj,'$.spaceId')=estacionamento_vagas.id OR json_extract(obj,'$.id')=estacionamento_vagas.scene_key),
      tipo=(SELECT json_extract(obj,'$.spaceType') FROM input WHERE json_extract(obj,'$.spaceId')=estacionamento_vagas.id OR json_extract(obj,'$.id')=estacionamento_vagas.scene_key),
      posicao_x=(SELECT CAST(json_extract(obj,'$.x')*7 AS INTEGER) FROM input WHERE json_extract(obj,'$.spaceId')=estacionamento_vagas.id OR json_extract(obj,'$.id')=estacionamento_vagas.scene_key),
      posicao_y=(SELECT CAST(json_extract(obj,'$.y')*7 AS INTEGER) FROM input WHERE json_extract(obj,'$.spaceId')=estacionamento_vagas.id OR json_extract(obj,'$.id')=estacionamento_vagas.scene_key),
      setor_id=(SELECT sector FROM input WHERE json_extract(obj,'$.spaceId')=estacionamento_vagas.id OR json_extract(obj,'$.id')=estacionamento_vagas.scene_key),ativo=1,atualizado_em=CURRENT_TIMESTAMP
      WHERE comunidade_id=? AND ${allowed} AND EXISTS(SELECT 1 FROM input WHERE json_extract(obj,'$.spaceId')=estacionamento_vagas.id OR json_extract(obj,'$.id')=estacionamento_vagas.scene_key)`,
        )
        .bind(json, json, community, token),
    );
    statements.push(
      db
        .prepare(
          `INSERT INTO estacionamento_cenas_historico(comunidade_id,revisao,cena,criado_por) SELECT comunidade_id,revisao,publicada,atualizado_por FROM estacionamento_cenas WHERE comunidade_id=? AND token=?`,
        )
        .bind(community, token),
    );
  }
  try {
    const result = await db.batch(statements);
    if (!result[1].results?.length)
      return Response.json(
        {
          error:
            "Publicação bloqueada: o mapa mudou ou uma vaga removida/alterada possui ocupação ou reserva ativa. Atualize e resolva os vínculos.",
        },
        { status: 409 },
      );
    return Response.json({ ok: true, revision: Number(payload.revision) + 1 });
  } catch (e) {
    if (/UNIQUE|constraint/i.test(String(e)))
      return Response.json(
        {
          error:
            "Código de vaga ou nome de setor já utilizado. Use outro nome, inclusive para registros arquivados.",
        },
        { status: 409 },
      );
    throw e;
  }
}
