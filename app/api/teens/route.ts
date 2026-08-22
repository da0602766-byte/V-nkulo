import { getD1 } from "../../../db";
import { requireApiPermission } from "../../lib/access";

export async function GET() {
  const access = await requireApiPermission("TEENS_VER");
  if (access.error) return access.error;
  const db = getD1();
  const [teens, followups] = await Promise.all([
    db.prepare(
      `SELECT u.id, u.nome, u.data_nascimento, u.nome_pais, u.telefone,
       CAST((julianday('now') - julianday(u.data_nascimento)) / 365.2425 AS INTEGER) AS idade,
       d.nome AS diaconia_equipe_nome
       FROM usuarios u LEFT JOIN diaconia_equipes d ON d.id = u.diaconia_equipe_id
       WHERE u.ativo = 1 AND u.data_nascimento IS NOT NULL
       AND date(u.data_nascimento, '+17 years') > date('now') ORDER BY u.nome`,
    ).all(),
    db.prepare(
      `SELECT t.*, u.nome AS usuario_nome FROM teens_acompanhamentos t
       JOIN usuarios u ON u.id = t.usuario_id ORDER BY t.criado_em DESC LIMIT 200`,
    ).all(),
  ]);
  return Response.json({ teens: teens.results, acompanhamentos: followups.results });
}
