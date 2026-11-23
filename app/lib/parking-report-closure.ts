/** Materialize confirmed shift reports on the server, even with the operator offline. */
export async function closeParkingReports(db: D1Database, communityId: number | null = null) {
  const scope = communityId === null ? "" : "AND e.comunidade_id=?";
  await db.prepare(`INSERT INTO estacionamento_relatorios_escala
    (comunidade_id,escala_id,usuario_id,resumo,entradas,saidas,ocorrencias,status)
    SELECT e.comunidade_id,e.id,d.usuario_id,'Fechamento automático do plantão.',
      (SELECT COUNT(*) FROM estacionamento_movimentacoes x WHERE x.comunidade_id=e.comunidade_id AND datetime(x.entrada_em) BETWEEN datetime(e.inicia_em) AND datetime(e.termina_em)),
      (SELECT COUNT(*) FROM estacionamento_movimentacoes x WHERE x.comunidade_id=e.comunidade_id AND datetime(x.saida_em) BETWEEN datetime(e.inicia_em) AND datetime(e.termina_em)),
      (SELECT COUNT(*) FROM estacionamento_ocorrencias x WHERE x.comunidade_id=e.comunidade_id AND datetime(x.criado_em) BETWEEN datetime(e.inicia_em) AND datetime(e.termina_em)),
      'AGUARDANDO_LIDER'
    FROM escalas_ministerio e
    JOIN comunidades c ON c.id=e.comunidade_id AND c.status='ATIVA'
    JOIN ministerios_comunidade m ON m.id=e.ministerio_id AND m.comunidade_id=e.comunidade_id AND m.categoria='ESTACIONAMENTO' AND m.status='ATIVO'
    JOIN estacionamento_configuracoes p ON p.comunidade_id=e.comunidade_id AND p.ativo=1
    JOIN escala_designacoes d ON d.escala_id=e.id AND d.comunidade_id=e.comunidade_id AND d.ativo=1 AND d.status IN ('CONFIRMADA','PRESENTE','AUSENTE')
    JOIN usuario_comunidades uc ON uc.usuario_id=d.usuario_id AND uc.comunidade_id=e.comunidade_id AND uc.status='ATIVO'
    JOIN usuarios u ON u.id=d.usuario_id AND u.ativo=1
    LEFT JOIN estacionamento_relatorios_escala r ON r.escala_id=e.id AND r.usuario_id=d.usuario_id
    LEFT JOIN assinaturas_comunidade s ON s.comunidade_id=e.comunidade_id
    WHERE e.status IN ('PUBLICADA','ENCERRADA') AND datetime(e.termina_em)<=CURRENT_TIMESTAMP ${scope}
      AND (s.comunidade_id IS NULL OR (s.status='ATIVA' AND (s.termina_em IS NULL OR datetime(s.termina_em)>CURRENT_TIMESTAMP)
        AND EXISTS(SELECT 1 FROM json_each(s.contrato,'$.modulos') WHERE value='parking')
        AND EXISTS(SELECT 1 FROM json_each(s.contrato,'$.recursos') WHERE value='reports')))
      AND (r.id IS NULL OR (r.status='AGUARDANDO_MEMBRO' AND r.revisado_por IS NULL))
    ORDER BY e.termina_em DESC, e.id DESC, d.id DESC LIMIT 100
    ON CONFLICT(escala_id,usuario_id) DO UPDATE SET resumo=excluded.resumo,entradas=excluded.entradas,
      saidas=excluded.saidas,ocorrencias=excluded.ocorrencias,status=excluded.status,atualizado_em=CURRENT_TIMESTAMP
    WHERE estacionamento_relatorios_escala.status='AGUARDANDO_MEMBRO' AND estacionamento_relatorios_escala.revisado_por IS NULL`)
    .bind(...(communityId === null ? [] : [communityId])).run();
}
