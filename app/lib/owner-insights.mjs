// Leitura analítica dos sinais que a própria plataforma já registra.
//
// A regra que orienta este arquivo: destacar só o que os dados sustentam.
// Comparação entre períodos, tendência e ponto fora da curva são estatística
// descritiva sobre séries reais — não são diagnóstico de causa. Por isso todo
// destaque que aponta uma origem provável carrega `correlacao: true`, e a
// interface precisa apresentá-lo como hipótese a investigar, nunca como causa
// confirmada.
//
// Fica em .mjs (e não .ts) pela mesma razão que tenant-policy.mjs: são funções
// puras, e assim os testes em tests/ conseguem importá-las direto.

/**
 * @typedef {{ chave: string, total: number }} SeriePonto
 * @typedef {{ atual: number, anterior: number, variacao: number,
 *             direcao: "ALTA" | "QUEDA" | "ESTAVEL" }} Tendencia
 * @typedef {{ id: string, nivel: "INFORMACAO" | "ATENCAO" | "CRITICO",
 *             titulo: string, detalhe: string, correlacao: boolean }} Destaque
 */

/**
 * Variação percentual entre dois períodos de mesmo tamanho.
 * Variação menor que 5% é tratada como estável — ruído não vira manchete.
 * @param {number} atual
 * @param {number} anterior
 * @returns {Tendencia}
 */
export function compararPeriodos(atual, anterior) {
  const atualSeguro = Number(atual) || 0;
  const anteriorSeguro = Number(anterior) || 0;
  const variacao =
    anteriorSeguro === 0
      ? atualSeguro === 0
        ? 0
        : 100
      : Math.round(((atualSeguro - anteriorSeguro) / anteriorSeguro) * 100);
  const direcao =
    Math.abs(variacao) < 5 ? "ESTAVEL" : variacao > 0 ? "ALTA" : "QUEDA";
  return { atual: atualSeguro, anterior: anteriorSeguro, variacao, direcao };
}

/**
 * Pontos fora do comportamento esperado da própria série, pelo desvio padrão.
 * Séries com menos de 4 pontos não sustentam a afirmação de anomalia, então
 * devolvem lista vazia em vez de um palpite.
 * @param {SeriePonto[]} serie
 * @param {number} [sensibilidade] desvios padrão a partir dos quais destacar
 */
export function detectarAnomalias(serie, sensibilidade = 2) {
  const pontos = (serie || []).map((ponto) => ({
    chave: String(ponto.chave),
    total: Number(ponto.total) || 0,
  }));
  if (pontos.length < 4) return [];
  const valores = pontos.map((ponto) => ponto.total);
  const media = valores.reduce((soma, valor) => soma + valor, 0) / valores.length;
  const variancia =
    valores.reduce((soma, valor) => soma + (valor - media) ** 2, 0) / valores.length;
  const desvioPadrao = Math.sqrt(variancia);
  if (desvioPadrao === 0) return [];
  return pontos
    .map((ponto) => ({
      ...ponto,
      desvio: Number(((ponto.total - media) / desvioPadrao).toFixed(2)),
    }))
    .filter((ponto) => Math.abs(ponto.desvio) >= sensibilidade);
}

/**
 * Preenche os dias sem registro com zero, para o gráfico não mentir por omissão
 * (um dia ausente na consulta não pode virar um dia "sem barra" ambíguo).
 * @param {SeriePonto[]} serie
 * @param {number} dias
 * @param {Date} [referencia]
 * @returns {SeriePonto[]}
 */
export function completarSerieDiaria(serie, dias, referencia = new Date()) {
  const porChave = new Map(
    (serie || []).map((ponto) => [String(ponto.chave), Number(ponto.total) || 0]),
  );
  return Array.from({ length: dias }, (_, indice) => {
    const data = new Date(
      Date.UTC(
        referencia.getUTCFullYear(),
        referencia.getUTCMonth(),
        referencia.getUTCDate() - (dias - 1 - indice),
      ),
    );
    const chave = data.toISOString().slice(0, 10);
    return { chave, total: porChave.get(chave) || 0 };
  });
}

function formatarVariacao(tendencia) {
  return `${tendencia.variacao > 0 ? "+" : ""}${tendencia.variacao}%`;
}

/**
 * Monta os destaques da Visão Geral a partir das séries reais.
 * Nada é emitido sem número que o sustente: sem dado, sem destaque.
 * @returns {Destaque[]}
 */
export function montarDestaques(entrada = {}) {
  /** @type {Destaque[]} */
  const destaques = [];

  if (entrada.usuariosAtivos && entrada.usuariosAtivos.direcao !== "ESTAVEL") {
    const tendencia = entrada.usuariosAtivos;
    destaques.push({
      id: "usuarios-ativos",
      nivel: tendencia.direcao === "QUEDA" ? "ATENCAO" : "INFORMACAO",
      titulo: `Usuários ativos ${
        tendencia.direcao === "ALTA" ? "cresceram" : "caíram"
      } ${formatarVariacao(tendencia)}`,
      detalhe: `${tendencia.atual} no período atual contra ${tendencia.anterior} no período anterior.`,
      correlacao: false,
    });
  }

  if (entrada.erros && entrada.erros.direcao === "ALTA" && entrada.erros.atual > 0) {
    destaques.push({
      id: "erros",
      nivel: entrada.erros.variacao >= 50 ? "CRITICO" : "ATENCAO",
      titulo: `Falhas registradas subiram ${formatarVariacao(entrada.erros)}`,
      detalhe: `${entrada.erros.atual} ocorrências no período atual contra ${entrada.erros.anterior} no anterior. A origem ainda precisa ser confirmada na central de incidentes.`,
      correlacao: true,
    });
  }

  for (const anomalia of detectarAnomalias(entrada.seriesErros || [])) {
    if (anomalia.desvio <= 0) continue;
    destaques.push({
      id: `anomalia-erros-${anomalia.chave}`,
      nivel: "ATENCAO",
      titulo: `Dia fora do padrão em ${anomalia.chave}`,
      detalhe: `${anomalia.total} falhas registradas, ${anomalia.desvio} desvios acima da média do período. Pode coincidir com uma publicação — confira o histórico de versões antes de concluir.`,
      correlacao: true,
    });
  }

  for (const comunidade of entrada.comunidadesForaDoPadrao || []) {
    destaques.push({
      id: `comunidade-${comunidade.nome}`,
      nivel: "ATENCAO",
      titulo: `A comunidade ${comunidade.nome} está fora do comportamento esperado`,
      detalhe: `Atividade ${comunidade.desvio} desvios da média das demais comunidades. Nenhum conteúdo privado foi inspecionado para gerar este indicador.`,
      correlacao: true,
    });
  }

  if (entrada.incidentesCriticos) {
    destaques.push({
      id: "incidentes-criticos",
      nivel: "CRITICO",
      titulo: `${entrada.incidentesCriticos} incidente(s) crítico(s) em aberto`,
      detalhe: "Abra a Central de Incidentes para tratar por prioridade.",
      correlacao: false,
    });
  }

  if (entrada.comunidadesSuspensas) {
    destaques.push({
      id: "comunidades-suspensas",
      nivel: "ATENCAO",
      titulo: `${entrada.comunidadesSuspensas} comunidade(s) suspensa(s)`,
      detalhe: "Situação administrativa pendente de revisão.",
      correlacao: false,
    });
  }

  if (entrada.cobrancasVencidas) {
    destaques.push({
      id: "cobrancas-vencidas",
      nivel: "ATENCAO",
      titulo: `${entrada.cobrancasVencidas} cobrança(s) vencida(s)`,
      detalhe: "Verifique a inadimplência em Financeiro.",
      correlacao: false,
    });
  }

  if (entrada.moduloMaisUsado && entrada.moduloMaisUsado.total > 0) {
    destaques.push({
      id: "modulo-mais-usado",
      nivel: "INFORMACAO",
      titulo: `Módulo mais utilizado: ${entrada.moduloMaisUsado.nome}`,
      detalhe: `${entrada.moduloMaisUsado.total} comunidades com o módulo habilitado.`,
      correlacao: false,
    });
  }

  const ordem = { CRITICO: 0, ATENCAO: 1, INFORMACAO: 2 };
  return destaques.sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);
}
