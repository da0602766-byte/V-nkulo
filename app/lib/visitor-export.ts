import { getD1 } from "../../db";
import { visitorToday } from "./visitor-attention";
import { visitorAge, visitorAgeGroup } from "./visitor-care";

export async function visitorExportRows(db: ReturnType<typeof getD1>, communityId: number) {
  const result = await db.prepare(`SELECT v.*, c.nome AS celula_nome, vc.nome AS categoria_nome,
    COALESCE(NULLIF(trim(v.responsavel_acompanhamento), ''), u.nome, '') AS responsavel_nome,
    COALESCE(m.nome, NULLIF(trim(v.ministerio), ''), '') AS ministerio_nome,
    (SELECT MAX(a.criado_em) FROM acompanhamentos a WHERE a.visitante_id = v.id AND a.comunidade_id = v.comunidade_id AND a.escopo_confirmado = 1) AS ultimo_contato,
    (SELECT a.proximo_contato FROM acompanhamentos a WHERE a.visitante_id = v.id AND a.comunidade_id = v.comunidade_id AND a.escopo_confirmado = 1 ORDER BY a.id DESC LIMIT 1) AS proximo_contato
    FROM visitantes v
    LEFT JOIN celulas c ON c.id = v.celula_id AND c.comunidade_id = v.comunidade_id AND c.escopo_confirmado = 1
    LEFT JOIN visitante_categorias vc ON vc.id = v.categoria_id AND vc.comunidade_id = v.comunidade_id
    LEFT JOIN usuarios u ON u.id = vc.responsavel_usuario_id AND vc.ativa = 1
    LEFT JOIN ministerios_comunidade m ON m.id = vc.ministerio_id AND m.comunidade_id = v.comunidade_id AND m.status = 'ATIVO' AND vc.ativa = 1
    WHERE v.comunidade_id = ? AND v.escopo_confirmado = 1 ORDER BY v.id LIMIT 10001`).bind(communityId).all<Record<string, unknown>>();
  if (result.results.length > 10000) throw new Error("O limite de 10.000 fichas por exportação foi excedido. Nenhuma exportação parcial foi gerada.");
  return mapVisitorExportRows(result.results);
}

export function mapVisitorExportRows(rows: Record<string, unknown>[]) {
  const today = visitorToday();
  const answer = (value: unknown) => value === "SIM" ? "Sim" : value === "NAO" ? "Não" : "Não informado";
  return rows.map(v => ({
    ID: Number(v.id), Nome: String(v.nome_completo), "Data de nascimento": String(v.data_nascimento || ""),
    Idade: visitorAge(v.data_nascimento as string | null, today) ?? "", "Faixa etária": visitorAgeGroup(v.data_nascimento as string | null, today),
    Telefone: String(v.telefone || ""), "E-mail": String(v.email || ""), "Data de entrada": String(v.data_entrada),
    Vínculo: v.tipo_pessoa === "MEMBRO" ? "Membro" : "Visitante", Categoria: String(v.categoria_nome || ""),
    Batizado: answer(v.batizado), "Certificado de batismo": answer(v.certificado_batismo),
    "Encontro com Deus": v.encontro_com_deus ? "Sim" : "Não registrado", "Curso de membros": v.curso_membros ? "Sim" : "Não registrado",
    Célula: String(v.celula_nome || ""), Discipulado: answer(v.discipulado), Discipulador: String(v.discipulador || ""),
    "Responsável pelo acompanhamento": String(v.responsavel_nome || v.responsavel_acompanhamento || ""), "Quem recebeu": String(v.acompanhante || ""),
    "Doa a Doa": answer(v.doa_a_doa), "Deve receber apoio": answer(v.doa_receber), "Doações realizadas": String(v.doacoes_realizadas || ""),
    Ministério: String(v.ministerio_nome || v.ministerio || ""), Oficial: answer(v.oficial), "Função do oficial": String(v.funcao_oficial || ""),
    "Próxima ação": String(v.proxima_acao || ""), "Prazo da ação": String(v.data_proxima_acao || ""),
    "Último contato": String(v.ultimo_contato || ""), "Próximo contato": String(v.proximo_contato || ""),
    Status: String(v.status), Arquivado: v.ativo ? "Não" : "Sim", Observações: String(v.observacoes || ""),
    Parente: String(v.parente || ""), Endereço: String(v.endereco || ""), "Atualizado em": String(v.atualizado_em || ""),
  }));
}
