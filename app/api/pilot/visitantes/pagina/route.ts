import { getD1 } from "../../../../../db";
import { requireTenantPermission } from "../../../../lib/tenant";
import { migrateVisitorAgeCategories } from "../../../../lib/visitor-category-rules";
import { visitorCustomFields } from "../../../../lib/visitor-custom-fields";
import { getRuntimeEnv } from '../../../../../db/runtime-env';

// One community-scoped snapshot powers the directory, birthdays and care views.
// History remains behind followups.view and is fetched only when a file opens.
export async function GET() {
  const access = await requireTenantPermission("visitors.view");
  if ("error" in access) return access.error;
  const db = getD1(), community = access.context.comunidadeId;
  await migrateVisitorAgeCategories(db, community);
  const canManage = access.context.isOwner || access.context.permissions.includes("visitor.categories.manage");
  const [people, categories, fields, responsibles, ministries, cells] = await Promise.all([
    db.prepare(`SELECT v.*, c.nome AS categoria_nome, cell.nome AS celula_nome,
      m.nome AS ministerio_categoria, u.nome AS responsavel_categoria,
      a.criado_em AS ultimo_contato, a.proximo_contato
      FROM visitantes v
      LEFT JOIN visitante_categorias c ON c.id=v.categoria_id AND c.comunidade_id=v.comunidade_id AND c.ativa=1
      LEFT JOIN ministerios_comunidade m ON m.id=c.ministerio_id AND m.comunidade_id=v.comunidade_id AND m.status='ATIVO'
      LEFT JOIN usuarios u ON u.id=c.responsavel_usuario_id
      LEFT JOIN celulas cell ON cell.id=v.celula_id AND cell.comunidade_id=v.comunidade_id AND cell.escopo_confirmado=1
      LEFT JOIN acompanhamentos a ON a.id=(SELECT max(ax.id) FROM acompanhamentos ax
        WHERE ax.visitante_id=v.id AND ax.comunidade_id=v.comunidade_id AND ax.escopo_confirmado=1)
      WHERE v.comunidade_id=? AND v.escopo_confirmado=1 ORDER BY v.nome_completo COLLATE NOCASE, v.id LIMIT 10001`)
      .bind(community).all(),
    db.prepare(`SELECT c.*, u.nome AS responsavel_nome, m.nome AS ministerio_nome
      FROM visitante_categorias c LEFT JOIN usuarios u ON u.id=c.responsavel_usuario_id
      LEFT JOIN ministerios_comunidade m ON m.id=c.ministerio_id AND m.comunidade_id=c.comunidade_id AND m.status='ATIVO'
      WHERE c.comunidade_id=? AND c.ativa=1 ORDER BY c.ordem,c.nome`).bind(community).all(),
    visitorCustomFields(db, community),
    canManage ? db.prepare(`SELECT u.id,u.nome FROM usuario_comunidades uc JOIN usuarios u ON u.id=uc.usuario_id
      WHERE uc.comunidade_id=? AND uc.status='ATIVO' AND u.ativo=1 ORDER BY u.nome LIMIT 250`).bind(community).all() : Promise.resolve({results:[]}),
    canManage ? db.prepare("SELECT id,nome FROM ministerios_comunidade WHERE comunidade_id=? AND status='ATIVO' ORDER BY nome LIMIT 150").bind(community).all() : Promise.resolve({results:[]}),
    db.prepare("SELECT id,nome FROM celulas WHERE comunidade_id=? AND ativo=1 AND escopo_confirmado=1 ORDER BY nome")
      .bind(community).all(),
  ]);
  if (people.results.length > 10000) return Response.json({ error:"Esta comunidade excede o limite de 10.000 fichas desta visualização." }, {status:422});
  const revision=getRuntimeEnv().visitorDrive?.config.revisao;
  if(revision!==undefined)for(const row of people.results as Record<string,unknown>[])row._driveRevision=revision;
  return Response.json({ permissions:access.context.permissions, visitantes:people.results, celulas:cells.results, categorias:categories.results, campos:fields,
    responsaveis:responsibles.results, ministerios:ministries.results }, {headers:{"Cache-Control":"private, no-store"}});
}
