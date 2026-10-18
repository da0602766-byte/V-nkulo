import { getD1 } from "../../../../../db";
import { requireTenantPermission } from "../../../../lib/tenant";
import { migrateVisitorAgeCategories } from "../../../../lib/visitor-category-rules";

// One community-scoped snapshot powers the directory, birthdays and care views.
// History remains behind followups.view and is fetched only when a file opens.
export async function GET() {
  const access = await requireTenantPermission("visitors.view");
  if ("error" in access) return access.error;
  const db = getD1(), community = access.context.comunidadeId;
  await migrateVisitorAgeCategories(db, community);
  const [people, cells] = await Promise.all([
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
    db.prepare("SELECT id,nome FROM celulas WHERE comunidade_id=? AND ativo=1 AND escopo_confirmado=1 ORDER BY nome")
      .bind(community).all(),
  ]);
  if (people.results.length > 10000) return Response.json({ error:"Esta comunidade excede o limite de 10.000 fichas desta visualização." }, {status:422});
  return Response.json({ visitantes:people.results, celulas:cells.results }, {headers:{"Cache-Control":"private, no-store"}});
}
