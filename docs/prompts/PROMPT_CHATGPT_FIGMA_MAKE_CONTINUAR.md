# Prompt para o ChatGPT/Figma Make — completar as 19 telas restantes

> **Como usar**: cole este texto inteiro na conversa do Figma Make (ou
> ChatGPT, se estiver gerando o projeto por lá) que já produziu o arquivo
> `Bloatynosy.zip` — a mesma conversa/projeto, para ele continuar a partir do
> que já existe, em vez de recomeçar. Se abrir um projeto novo, anexe também
> o `App.tsx` e o `index.css` atuais como referência de ponto de partida.

---

Você já gerou a primeira versão deste projeto (painel administrativo
"Vínkulo — Proprietário"), com a tela **Painel geral** completa e as outras
19 telas como placeholder ("Área em preparação"). Continue exatamente nesse
mesmo projeto — mesma stack (React + Vite + Tailwind v4 + `recharts` +
`lucide-react`), mesmo arquivo `src/App.tsx`, mesmos tokens de cor em
`src/index.css` — e implemente as 19 telas que faltam, cada uma com o mesmo
nível de acabamento da Visão Geral: KPIs, gráfico ou tabela reais (com dado
de exemplo, não "placeholder" genérico), filtros quando fizer sentido, e
estado vazio bem desenhado.

**Não mude a paleta, a tipografia, o componente de menu lateral, o topbar
nem o padrão dos `.metric`/`.panel`/`.data-table` já criados** — use-os como
biblioteca de componentes para todas as telas novas. Se uma tela precisar de
um componente que ainda não existe (ex.: uma trilha de etapas horizontal, um
badge de gravidade, um formulário em painel lateral), crie-o seguindo a
mesma linguagem visual (bordas 1px, cantos 7–9px, sem sombra pesada, cor só
para comunicar status) e reaproveite nas telas seguintes que precisarem dele.

## Import automático das novas telas (não deixe o `Placeholder` genérico)

Adicione ao `App.tsx`: cada `id` da navegação abaixo passa a renderizar seu
próprio componente de tela, no mesmo padrão do `Dashboard` atual — nada mais
deve cair no `<Placeholder title={activeName} />`.

## As 19 telas, com os campos reais que a API do sistema já devolve

Use exatamente estes nomes e formatos de campo nos dados de exemplo — é o
formato real que a implementação do backend já produz, então o resultado
sai pronto para ligar ao dado de verdade depois, sem reescrever a tela.

### 1. Solicitações de comunidade (`solicitacoes`)
Fila de cartões: `nome` da comunidade proposta, `cidade`, `solicitante_nome`,
`criado_em`, `modulos` selecionados (chips), `status` (PENDENTE / EM_ANALISE
/ APROVADA / RECUSADA). Duas ações por cartão: Analisar → Aprovar / Recusar
(motivo obrigatório na recusa, campo de texto revelado ao clicar).

### 2. Comunidades (`comunidades`)
Tabela: `nome`, `status` (ATIVA / MANUTENCAO / SUSPENSA / ARQUIVADA — badge
colorido), `dono.nome`, `assinatura.plano` + `assinatura.status`,
`atividade.membros` / `atividade.ativos30d` (mostrar como "X / limite" com
barra quando há teto), `problemas.incidentes` + `problemas.criticos`.
Clique na linha abre painel lateral com ações: colocar em manutenção (motivo
+ prazo em horas), arquivar, bloquear/desbloquear, editar limites (membros,
publicações, eventos, armazenamento — "0 = sem limite"), redefinir Dono da
Comunidade.

### 3. Pessoas (`pessoas`)
KPIs: `totais.total`, `totais.ativos`/`totais.inativos`, `totais.online_agora`,
`novos.atual` com `novos.variacao`%, `engajamento.taxaAtividade`%,
`engajamento.taxaAbandono`% (rótulo "abandono aparente"),
`totais.bloqueados`, `contasExcluidas.total`. Gráfico de área (como o de
Sessões da Visão Geral) para `evolucao` (12 meses, `chave`/`total`). Tabela
de retenção por coorte: `coortes[].chave` (mês), `cadastrados`, `retornaram`,
`taxa`% — com nota explicando "retenção da coorte hoje, não em D+30".
Tabela de distribuição por comunidade: `porComunidade[].nome`, `.membros`,
`.ativos_30d`. Filtros: período, comunidade, perfil.

### 4. Redefinições de senha (`senhas`)
Trilha horizontal de 5 estágios (mesmo componente de etapas que você vai
criar para a Publicação, mas mais simples): Solicitado → Em análise →
Aprovado/Recusado → Link enviado → Concluído/Expirado. Abaixo, tabela:
`solicitante`, `comunidade`, `solicitado_em`, `status`, `expira_em`,
`tentativas`, `analisado_por`. Ações por linha conforme o status. Ao gerar
link, mostrar uma vez com aviso "expira em 30 minutos".

### 5. Contas excluídas (`excluidas`)
Dois KPIs (`total`, `restauraveis`) + tabela: `referencia_tecnica`
(nunca nome/e-mail), `comunidade`, `perfil`, `motivo`, `origem`,
`excluido_em`, `restauravel_ate`. Ações: Restaurar (só se dentro do prazo),
Purgar definitivamente (com confirmação forte).

### 6. Planos e assinaturas (`assinaturas`)
Tabela de planos: `nome`, `preco_centavos` (formatar R$), `periodicidade`,
`limite_membros`, `limite_armazenamento_mb`, `modulos` (chips),
`assinaturas_ativas`/`assinaturas`, `status`. Badge "Exclusivo de
<comunidade>" quando houver `comunidade_exclusiva_id`. Botão "Novo plano"
abre painel lateral com formulário (nome, preço, periodicidade, limites,
módulos, dias de teste, duração, desconto, comunidade exclusiva). Seção de
cupons abaixo: `codigo`, `tipo` (PERCENTUAL/VALOR), `valor`, `plano`,
`valido_ate`, `usos`/`usos_maximos`, `ativo`.

### 7. Financeiro (`financeiro`)
KPIs: receita do período, a receber, vencido, comunidades inadimplentes.
Aviso discreto "pagamentos registrados administrativamente — sem gateway
conectado". Filtros: status, comunidade, competência. Tabela de cobranças:
`comunidade`, `plano`, `competencia`, `valor_centavos`, `desconto_centavos`,
`status` (PENDENTE/PAGA/VENCIDA/CANCELADA/ESTORNADA), `vence_em`, ações
(marcar paga / cancelar-estornar). Bloco "Renovações próximas" (45 dias).

### 8. Uso (`uso`)
(Já existe uma versão simplificada em outra tela de estatísticas do
sistema real — replique o padrão): KPIs de usuários ativos, comunidades
ativas, atividade no feed, eventos, conversão visitante→membro. Gráfico de
área com duas séries (Usuários / Comunidades, mesmas cores `--teal` e
`--accent`) dos últimos 6 meses.

### 9. Tempo real (`tempo-real`)
KPIs: `presenca.online_agora`, `presenca.sessoes_ativas`, pico simultâneo,
duração média de sessão (rotular "aproximada"). Dois gráficos de área:
ativos por hora (24h) e por dia (14d). Tabela de atividade por comunidade
(só nome + contagem — nunca conteúdo). Indicador "ao vivo" com atualização
a cada 30s (pode ser só visual/mock no protótipo) + botão atualizar manual.

### 10. Desempenho (`desempenho`)
Filtro de período (7/14/30/90 dias). KPIs: `falhas.tendencia.atual` (com
variação %), `falhas.taxa`%, `incidentes.abertos`, `autenticacao.bloqueados_agora`.
Gráfico de área de `falhas.serie` (`chave`/`total`), com o ponto de
`falhas.anomalias` destacado em vermelho (mesmo padrão do dashboard
principal). Tabela "onde as falhas acontecem": `evento`, `resultado`
(badge ERRO/NEGADO), `total`, `ultima`. Tabela de incidentes por área/
gravidade. Bloco final "Lacunas conhecidas": grid de cartões tracejados
(latência, uptime, erros 4xx/5xx, CPU/memória, consultas lentas,
comparação entre versões) — cada um com o texto "fonte necessária: …",
nunca um valor preenchido.

### 11. Segurança e auditoria (`seguranca`)
Filtros (busca, resultado). Lista expansível de eventos: ícone de resultado
(✓/!), `evento` (humanizado), `comunidade`, `usuario_nome`, `criado_em`; ao
expandir, `metadados` em grade de pares chave/valor. Nota de retenção fixa
no topo.

### 12. Publicação do sistema (`publicacao`)
A tela mais elaborada: KPIs (última publicada, aguardando aprovação,
falhas em 30 dias, reversões automáticas). Cabeçalho da publicação
selecionada com `versao`, `commit_sha` (8 chars), `branch`, `autor`,
`iniciado_em`, `duracao_ms`. **Trilha horizontal de 9 etapas** — crie este
componente do zero: COMMIT → VALIDACAO → BUILD → TESTES → PREVIA →
APROVACAO → PUBLICACAO → HEALTH_CHECK → CONCLUIDO, cada etapa com número,
nome, status (sucesso=verde / crítica pendente=badge âmbar "crítica" /
em andamento=azul pulsante / falha=vermelho / pendente=cinza), duração e
link "Ver logs". Quando parada em Aprovação: painel de alerta destacado
("Esta publicação está parada esperando sua decisão") com textarea de
motivo + botões Aprovar/Recusar. Botão "Liberar publicação" **desabilitado
com tooltip** se `aprovacao_status !== 'APROVADO'` e ambiente é Produção —
essa regra não pode ficar só no texto, tem que aparecer desabilitada de
verdade no protótipo. Tabela de histórico: `versao`, `ambiente`, `status`
(badges, incluindo "reversão"/"automática" quando for rollback), `commit_sha`,
`autor`, `iniciado_em`, `duracao_ms`, etapas concluídas/9.

### 13. Incidentes (`incidentes`)
KPIs: críticos em aberto, altos em aberto, total em tratamento,
recorrentes. Filtros: status, gravidade, área, período, busca. Tabela:
`gravidade` (badge), `titulo`, `area`/`modulo`, `ocorrencias` (com selo
"recorrente" se > 1), `comunidades_afetadas`, `ultima_ocorrencia`, `status`,
ações (Assumir/Mitigar/Resolver/Ignorar/Reabrir). Linha com `gravidade =
CRITICA` ganha borda esquerda vermelha de 3px. Ao expandir: descrição,
histórico de ocorrências, campo de resolução obrigatório ao clicar
Resolver.

### 14. Publicações editoriais (`editorial`)
Fila de rascunhos/agendados: `titulo`, `categoria`, `status` (RASCUNHO/
AGUARDANDO_APROVACAO/AGENDADA/PUBLICADA), preview de imagem quando houver,
calendário lateral simples de programação.

### 15. Feedback e denúncias (`feedback`)
Lista filtrável (tipo, categoria, status): `mensagem` (truncada), `pagina`,
`usuario`, `criado_em`, `status` (PENDENTE/RESPONDIDO/ARQUIVADO). Ao abrir:
campo de resposta do Proprietário + botão "Abrir publicação relacionada".

### 16. Otimização (`otimizacao`)
Cartões de diagnóstico por categoria (sessões expiradas, redefinições
vencidas, etc.): nome da categoria, contagem de registros candidatos,
botão "Limpar com segurança" com confirmação explicando que só dado
obsoleto/expirado é afetado, nunca dado ativo.

### 17. Aparência (`aparencia`)
Seletor de comunidade ou "Todas". Preview ao vivo de um cartão de
comunidade (logo, banner, paleta) ao lado dos controles: upload de
logotipo, upload de banner, 3–4 seletores de cor.

### 18. Laboratório (`laboratorio`)
Lista de experimentos (ativos/arquivados): `nome`, `dispositivo_principal`
(chip: mobile/tablet/desktop/wide), `versao`, `atualizado_em`. Botão "Novo
experimento" a partir de um template. Ao abrir um experimento: preview em
iframe com seletor de dispositivo + histórico de versões com "criar
checkpoint" / "restaurar".

### 19. Configurações (`configuracoes`)
Formulário "Alterar uma configuração": seletor de chave (ex.: modo de
manutenção global, versão mínima do APK, versão mínima do PWA, bloqueio
emergencial de recurso — cada uma com badge "crítica" quando aplicável),
escopo (Plataforma/Comunidade/Módulo), campo de valor, motivo (obrigatório
quando a chave é crítica). Tabela de valores vigentes. Bloco de feature
flags: nome, escopo, estado (liga/desliga), percentual de liberação
gradual (0–100%), janela de datas. Bloco final "Reversão rápida": histórico
combinado (configurações + flags) com botão "Reverter" em cada linha.

## Regras que valem para todas as 19 telas

1. **Todo dado numérico de exemplo precisa ser plausível e coerente entre
   telas** — se a Visão Geral mostra 148 comunidades ativas, a tela
   Comunidades deve listar uma amostra compatível com esse total, não um
   universo diferente.
2. **Todo estado vazio é desenhado**, nunca "sem dados" cinza — reaproveite
   o padrão de `.empty-view` já criado na Visão Geral (ícone, título,
   texto explicando o que vai aparecer ali).
3. **Toda tabela precisa funcionar em ~390px de largura** — vire lista de
   cartões empilhados abaixo do breakpoint de 720px já usado no
   `index.css`, exatamente como a tabela de comunidades da Visão Geral já
   faz.
4. **Nenhuma ação sensível (arquivar, bloquear, excluir, aprovar
   publicação em produção, redefinir dono) dispara sem um passo de
   confirmação visível** — modal ou campo de motivo revelado antes do
   botão de confirmar ficar habilitado.
5. Ao final, a navegação lateral deve ter **as 20 telas navegáveis de
   verdade** (a Visão Geral que já existe + as 19 novas) — nenhuma deve
   cair mais no componente `Placeholder`.

Comece pela tela **Publicação do sistema** (a mais complexa, com o
componente de trilha novo) e pela tela **Incidentes** (reaproveita o mesmo
padrão de badge de gravidade que outras telas vão usar), depois siga pelas
demais na ordem listada acima.
