# Script de redesign — Área do Proprietário (Vínkulo)

> **Como usar este documento**
> Este é um brief de design completo para redesenhar do zero, no Figma, as
> 20 telas da área do Proprietário. Pode ser usado de três formas:
> 1. Colado inteiro (ou seção por seção) numa ferramenta de geração de design
>    por texto do Figma ("First Draft"/IA de texto-para-design ou plugins
>    equivalentes) como prompt de criação.
> 2. Entregue a um designer humano como brief funcional — cada tela lista
>    dado real, estados e ações, não só aparência.
> 3. Usado como checklist de revisão: depois de desenhado, cada seção vira
>    um item de "bateu com o brief?".
>
> **O que este documento NÃO é**: não é um mockup, não é código, e não
> descreve o que já existe hoje — descreve o que o redesign deve produzir.
> A funcionalidade e os dados citados são reais (vêm da implementação atual
> do sistema); a direção visual é nova e deve ser aplicada por igual às 20
> telas, sem deixar nenhuma no estilo antigo.

---

## 0. Briefing em uma frase

Um **centro de comando administrativo SaaS**, denso mas organizado, para o
Proprietário de uma plataforma multi-tenant de gestão de comunidades
religiosas (Vínkulo) — visão geral que decide e direciona, tabelas fortes em
vez de cartões, gráficos amplos que destacam só o que muda decisão, e uma
paleta que comunica gravidade (crítico/atenção/ok) de forma consistente em
todas as 20 telas.

---

## 1. Fundamentos do sistema de design

### 1.1 Princípios (aplicar às 20 telas sem exceção)

1. **Densidade organizada, não densidade caótica.** Mais informação por tela
   do que um dashboard consumer, mas sempre agrupada com hierarquia clara —
   nunca uma parede de números.
2. **Tabela é o componente principal, cartão é exceção.** Cartões (KPI tiles)
   só para os 4–7 números que respondem "está tudo bem?" de relance. Todo o
   resto — listas de comunidades, incidentes, cobranças, histórico — é
   tabela, mesmo em telas com poucos itens.
3. **Gráfico amplo, não miniatura decorativa.** Quando houver gráfico, ele
   ocupa a largura do conteúdo e tem eixo, rótulos e tooltip — nunca uma
   sparkline sem contexto.
4. **Vazio é uma tela desenhada, não um "sem dados" cinza.** Todo estado
   vazio explica por que está vazio e o que vai aparecer ali.
5. **Nenhuma sombra pesada.** Separação por linha fina (1px) e por espaço em
   branco, não por `box-shadow` grosso. No máximo uma sombra suave em
   modais/popovers.
6. **Cor comunica gravidade, não decoração.** Vermelho/rosa = crítico,
   âmbar = atenção, verde = ok/saudável, roxo/violeta = a cor de marca (usada
   com moderação, nunca para status). Ver paleta em 1.3.
7. **Claro e escuro são cidadãos de primeira classe.** Todo componente é
   desenhado nos dois temas, lado a lado, antes de aprovado.
8. **Mobile não é "a versão cortada".** Abaixo de ~720px as tabelas viram
   listas de cartões empilhados (rótulo + valor em cada linha), a navegação
   lateral vira uma faixa horizontal rolável no topo, e os gráficos de barra
   mantêm rótulos legíveis (rotacionar ou abreviar, nunca cortar).

### 1.2 Grid e layout global

- **Casca fixa**: barra superior (topo) + navegação lateral (esquerda,
  fixa) + área de conteúdo (direita, rolável). No mobile, a lateral colapsa
  para uma faixa horizontal fixa abaixo do topo.
- **Largura do conteúdo**: fluida até um teto de ~1400px, com respiro lateral
  mínimo de 24px (desktop) / 16px (mobile).
- **Grid de 12 colunas** para blocos de conteúdo dentro de cada tela; a
  faixa de KPIs usa `auto-fit, minmax(160–180px, 1fr)`.
- **Espaçamento em escala de 4px**: 4, 8, 12, 16, 20, 24, 32, 48. Gaps entre
  blocos de uma tela: 20–24px. Gaps internos de um cartão/linha: 8–12px.
- **Cantos**: 8px em botões/inputs, 10–12px em painéis e cartões, 999px
  (pílula) em badges/tags.

### 1.3 Paleta (tokens — nomear exatamente assim no Figma)

Definir como **variáveis de cor** do Figma, com um modo "Claro" e um modo
"Escuro" por token (não arquivos separados).

| Token | Papel | Claro | Escuro |
|---|---|---|---|
| `bg` | fundo da página | `#F7F5FB` | `#0B0D10` |
| `surface` | fundo de painel/cartão | `#FFFFFF` | `#15181D` |
| `canvas` | fundo de hover/zebra | `#F4F7F8` | `#1B1F26` |
| `line` | bordas e divisores | `#DCE4E8` | `#2E353E` |
| `ink` | texto principal | `#20313F` | `#EDF1F5` |
| `muted` | texto secundário | `#6B7C89` | `#98A3B0` |
| `faint` | texto terciário / rótulos | `#9A93A8` | `#6F7885` |
| `violet` (marca) | destaque de marca, links, foco | `#B25A33` | `#D9784C` |
| `violet-deep` | hover/ativo da marca | `#98492A` | `#E68B5F` |
| `teal` (ação neutra) | botões secundários, barras de gráfico neutras | `#17877F` | mesmo tom, ajustar luminância |
| `green` / `green-soft` | sucesso, saudável, pago | `#1B8F63` / `#E4F4EC` | ajustar para contraste AA |
| `amber` / `amber-soft` | atenção, pendente, em análise | `#A96C10` / `#FBF0DF` | idem |
| `rose` / `rose-soft` | crítico, erro, vencido, bloqueado | `#B93E58` / `#FBE9ED` | idem |

Regra dura: **todo par cor-de-fundo + cor-de-texto precisa passar WCAG AA
(4.5:1 para texto normal)** nos dois temas — projeto já teve bug de contraste
corrigido nessa base, não repetir.

### 1.4 Tipografia

- Fonte do sistema (a mesma já usada no produto: pilha `system-ui`), sem
  fonte customizada — prioriza performance e consistência com o resto do
  app.
- Escala: 13 / 14 / 15 / 16 / 18 / 22 / 26px. Título de tela = 22–26px
  semi-bold; título de bloco = 16–18px semi-bold; corpo = 14–15px regular;
  rótulo/legenda = 11–13px, letter-spacing 0.06–0.08em, uppercase, cor
  `faint`.
- Números grandes (KPI) = 22–28px, `font-variant-numeric: tabular-nums`
  (alinhamento vertical perfeito entre KPIs vizinhos).

### 1.5 Iconografia

- Um ícone só por item de navegação (atualmente glifos monocromáticos
  simples — ex.: ▦ ◇ ◎ ⚿ ⌫ ◆ $ ▥ ◉ ⚡ ✓ ⇧ ✦ ▲ ! ↻ ◐ ◈ ⚙). No redesign,
  substituir por um kit de ícones de linha consistente (24px, stroke 1.5–2px),
  mantendo o **significado** de cada um (ver lista de telas abaixo).
- Ícones de estado: círculo cheio para "crítico"/"aberto", meio-círculo para
  "em andamento"/"análise", círculo vazio para "resolvido"/"concluído".

### 1.6 Componentes-base (desenhar uma vez, reusar nas 20 telas)

1. **Faixa de KPI** (`stat tile`): rótulo uppercase pequeno, número grande,
   linha de contexto pequena abaixo (ex.: variação vs. período anterior,
   com seta e cor verde/vermelha). 4 a 7 tiles lado a lado, sem sombra, com
   separador de 1px entre eles (não cartões soltos).
2. **Tabela forte**: cabeçalho uppercase pequeno cor `faint`, linha zebra
   sutil só no hover (`canvas`), badges de status inline, ações à direita
   (texto/link ou botão pequeno). Em mobile: card por linha, rótulo à
   esquerda / valor à direita em cada campo.
3. **Badge/Tag de status**: pílula pequena, texto 11px semi-bold, cores dos
   tokens de gravidade (verde/âmbar/rosa/neutro).
4. **Barra de filtros**: linha de selects/inputs compactos (altura 36px),
   alinhados à direita ou acima da tabela/gráfico que filtram.
5. **Gráfico de barras** (evolução temporal): barras com `teal`, barra
   destacada em `rose` quando marcada como fora do padrão (anomalia); eixo
   x com rótulos de data abreviados; tooltip com valor exato ao passar o
   mouse.
6. **Painel de destaque/alerta** (highlight): bloco com borda esquerda
   colorida (3px) e fundo suave da mesma cor — usado para "isto pede
   atenção" (Visão Geral) e para avisos de correlação/heurística.
7. **Estado vazio**: ícone outline centralizado, título curto, uma frase
   explicando por que está vazio e o que vai aparecer.
8. **Estado de carregamento**: um spinner discreto + texto (nunca skeleton
   agressivo pulsando a tela toda).
9. **Modal de confirmação para ação sensível**: título, texto explicando a
   consequência, campo de motivo obrigatório quando a ação exige
   justificativa, botão primário (cor da gravidade da ação — vermelho para
   destrutivo) + botão secundário cancelar.
10. **Barra lateral de navegação**: logo/nome do produto no topo, cartão de
    identidade do usuário (avatar + nome + selo "Proprietário"), lista de 20
    itens com ícone + rótulo, item ativo com barra lateral de 3px na cor de
    marca e fundo `canvas`.

---

## 2. Estrutura de navegação (as 20 telas, em ordem)

Agrupar visualmente a navegação em blocos com um pequeno espaçamento extra
entre grupos (sem título de seção, só respiro), nesta ordem:

**Governança e visão**
1. Painel geral (Visão Geral)
2. Solicitações de comunidade

**Comunidades e pessoas**
3. Comunidades
4. Pessoas
5. Redefinições de senha
6. Contas excluídas

**Comercial**
7. Planos e assinaturas
8. Financeiro

**Operação e saúde**
9. Uso
10. Tempo real
11. Desempenho
12. Segurança e auditoria
13. Publicação do sistema
14. Incidentes

**Conteúdo e experimentação**
15. Publicações editoriais
16. Feedback e denúncias
17. Otimização
18. Aparência
19. Laboratório

**Sistema**
20. Configurações

---

## 3. Especificação tela a tela

Cada tela abaixo segue o mesmo formato: **Propósito** (o que ela responde),
**Layout** (blocos de cima para baixo), **Dado real** (o que vem do backend
hoje, para o design não inventar métricas), **Estados** (vazio/erro/carregando
específicos), **Ações**.

### 3.1 Painel geral (Visão Geral)

**Propósito**: responder de relance "está tudo bem?" e apontar para onde ir.

**Layout**:
1. Cabeçalho de saudação + 3 números de destaque (decisões pendentes,
   comunidades ativas, pessoas ativas) + atalhos rápidos (Revisar
   solicitações, Feedback, Abrir comunidades).
2. Faixa de 6 KPIs: saúde do sistema (badge Estável/Atenção/Crítico),
   comunidades (ativas de X total, suspensas), pessoas (ativas de X,
   variação de crescimento em 30 dias), on-line agora, decisões pendentes,
   pagamentos (vencidos/pendentes).
3. Bloco "O que pede atenção": lista de destaques ordenados
   crítico→atenção→informação, cada um com um botão "Abrir" que leva à tela
   relevante. Destaques que apontam uma causa provável trazem a nota
   "Correlação observada, não causa confirmada."
4. Bloco de organização de cartões (o proprietário escolhe densidade 2x2 /
   2x4 / 4x2 / 4x4) + grade de métricas operacionais (comunidades ativas,
   usuários ativos, ministérios ativos, solicitações pendentes, eventos
   futuros, conversas na semana) — arrastáveis para reordenar.
5. Bloco "Distribuição atual" (gráfico de barras horizontais simples) +
   bloco "Permissões" (cartão explicando os 4 papéis do sistema:
   Proprietário, Admin da comunidade, Líder, Membro).
6. Duas colunas finais: "Comunidades recentes" (lista com avatar/iniciais) e
   "Atividade auditada" (últimos eventos da trilha).

**Dado real**: contagens de `comunidades`, `usuarios`, `sessoes`,
`auditoria_piloto`, `incidentes_plataforma`, `cobrancas_assinatura`.
**Nunca inventar** um destaque sem número que o sustente — se não há dado,
a lista de destaques mostra o estado vazio, não um destaque genérico.

**Estados**: vazio na lista de destaques = "Nenhum sinal fora do esperado
nos dados disponíveis."

### 3.2 Solicitações de comunidade

**Propósito**: aprovar/recusar pedidos de criação de nova comunidade — nada
é criado sem decisão explícita do Proprietário.

**Layout**: fila de cartões/linhas — nome da comunidade proposta, cidade,
responsável solicitante, data, módulos selecionados, com dois botões
(Analisar → Aprovar/Recusar) e campo de motivo na recusa.

**Estados**: vazio = "Nenhuma solicitação pendente."

### 3.3 Comunidades

**Propósito**: situação administrativa de cada comunidade e as ações sobre
ela (o redesign une aqui o diretório de comunidades existente com o painel
administrativo novo).

**Layout**:
1. Tabela: nome, situação (Ativa/Manutenção/Bloqueada/Arquivada), dono,
   plano vigente, membros/limite (com barra ou percentual quando há teto),
   ativos em 30 dias, problemas técnicos (contagem de incidentes abertos,
   destaque se houver crítico), botão "Administrar".
2. Ao abrir "Administrar" (painel expansível ou modal lateral): ações de
   manutenção (com prazo em horas e motivo obrigatório ≥10 caracteres),
   arquivar, bloquear/desbloquear, editar limites (membros, publicações,
   eventos, armazenamento — 0 = sem limite), redefinir Dono da Comunidade
   (exige que o novo dono já seja membro ativo da comunidade — nunca alguém
   de fora).

**Dado real**: `comunidades`, `usuario_comunidades`, `assinaturas_comunidade`,
`planos_plataforma`, `incidente_ocorrencias`. Armazenamento consumido
aparece como "sem medição" (teto configurável, uso em 0) até haver
integração com o provedor.

**Estados**: vazio = "Nenhuma comunidade cadastrada."

### 3.4 Pessoas

**Propósito**: indicadores agregados de usuários da plataforma — nunca
conteúdo pessoal ou de comunidade.

**Layout**:
1. Filtros: período, comunidade, perfil.
2. Faixa de KPIs: total de contas, ativas/inativas, on-line agora, novos
   cadastros (com variação vs. período anterior), taxa de atividade em 30
   dias, abandono aparente (sem acesso há 60 dias), bloqueadas, contas
   excluídas.
3. Gráfico de novos cadastros por mês (12 meses).
4. Tabela de retenção por coorte (mês de cadastro × taxa de retorno em 30
   dias) — rotular explicitamente como "retenção da coorte hoje", não
   "retenção em D+30", porque é isso que o dado sustenta.
5. Tabela de distribuição por comunidade (membros, ativos 30d, %
   participação).
6. Abaixo, o diretório completo de pessoas (busca, paginação, detalhe por
   pessoa com ações de ativar/desativar/excluir).

**Estados**: nenhuma métrica exibe número fictício; sem sessão registrada,
os gráficos mostram estado vazio.

### 3.5 Redefinições de senha

**Propósito**: aprovar pedidos de redefinição de senha de Donos de
Comunidade, com fluxo de estados visível.

**Layout**:
1. Faixa mostrando o fluxo: Solicitado → Em análise → Aprovado/Recusado →
   Link enviado → Concluído/Expirado (como uma trilha horizontal, no
   mesmo estilo do pipeline de publicação — reaproveitar o componente de
   trilha).
2. Tabela: solicitante, comunidade, data, status, prazo de expiração,
   tentativas, responsável pela aprovação, ações por linha.
3. Ao gerar o link: exibido uma única vez, com aviso "temporário, expira em
   30 minutos" — nunca reaparece em texto claro depois disso.

**Estados**: vazio = "Nenhuma solicitação de redefinição em aberto."

### 3.6 Contas excluídas

**Propósito**: administração e auditoria mínima de contas removidas —
nenhum dado pessoal preservado.

**Layout**: contagem no topo (total, restauráveis) + tabela (referência
técnica, comunidade, perfil, motivo, origem, data, janela de restauração
restante), ações Restaurar (só dentro da janela) / Purgar definitivamente.

**Estados**: vazio = "Nenhuma conta excluída."

### 3.7 Planos e assinaturas

**Propósito**: catálogo de planos configuráveis (não fixos) e as assinaturas
vigentes de cada comunidade.

**Layout**:
1. Tabela de planos: nome, preço formatado (BRL), periodicidade, limite de
   membros, armazenamento, módulos (chips), assinaturas ativas/total,
   badge "Exclusivo de <comunidade>" quando aplicável, status
   (Ativo/Arquivado).
2. Formulário de criação/edição (painel lateral ou expansível): nome, preço,
   periodicidade, limites, módulos, dias de teste, duração, desconto,
   comunidade exclusiva.
3. Bloco de cupons: código, tipo (percentual/valor), plano vinculado,
   validade, usos/limite, ativo/inativo.

**Estados**: excluir um plano com assinaturas vinculadas é bloqueado — a
interface explica "arquive ou migre as assinaturas" em vez de permitir a
exclusão.

### 3.8 Financeiro

**Propósito**: cobrança, inadimplência e renovação das assinaturas.

**Layout**:
1. Faixa de KPIs: receita reconhecida do período, a receber, vencido,
   comunidades inadimplentes.
2. Aviso discreto: "pagamentos registrados administrativamente — sem
   gateway conectado."
3. Filtros: status, comunidade, competência (mês inicial/final).
4. Tabela de cobranças: comunidade, plano, competência, valor, desconto,
   status, vencimento, ações (marcar paga, cancelar/estornar).
5. Bloco "Renovações próximas" (próximos 45 dias) com ações de reativar/
   cancelar/conceder carência.

**Estados**: sem cobranças = todos os KPIs em zero, com nota "nenhuma
cobrança registrada ainda" — nunca um número estimado.

### 3.9 Uso (Estatísticas)

**Propósito**: indicadores agregados de crescimento e participação da
plataforma.

**Layout**: KPIs (usuários ativos, comunidades ativas, atividade no feed,
eventos, conversão visitante→membro) + gráfico de barras duplo (usuários x
comunidades) dos últimos 6 meses.

### 3.10 Tempo real

**Propósito**: atividade da plataforma próxima de tempo real, sem expor
conteúdo privado.

**Layout**:
1. KPIs: on-line agora, sessões ativas, pico simultâneo, duração média de
   sessão (marcada como aproximada, já que não há evento de logout).
2. Gráfico de usuários ativos por hora (24h) e por dia (14d).
3. Tabela de atividade por comunidade (só contagem, nunca conteúdo).
4. Atualização automática a cada ~30s, com indicador discreto de "ao vivo"
   e botão manual de atualizar.

**Estados**: "módulos mais utilizados" e "dispositivo" aparecem como "sem
telemetria para este indicador ainda" quando o dado não existe — nunca
estimados.

### 3.11 Desempenho

**Propósito**: saúde do sistema a partir dos sinais que a própria
plataforma registra (não infraestrutura externa ainda não conectada).

**Layout**:
1. Filtro de período (7/14/30/90 dias).
2. KPIs: falhas e negações (com variação), taxa sobre ações auditadas,
   incidentes abertos, contas bloqueadas.
3. Gráfico amplo de falhas por dia, com barra destacada em `rose` nos dias
   fora do padrão (anomalia estatística) + nota de correlação, não causa.
4. Tabela "onde as falhas acontecem" (ação, resultado, ocorrências, última).
5. Tabela de incidentes em aberto por área/gravidade.
6. Bloco final "Lacunas conhecidas": grid de cartões tracejados listando
   cada métrica de infraestrutura ainda não disponível (latência, uptime,
   erros 4xx/5xx, CPU/memória) com a fonte que cada uma exigiria — nunca
   preenchidos com número.

### 3.12 Segurança e auditoria

**Propósito**: trilha de ações administrativas, protegida contra alteração.

**Layout**: filtros (busca, resultado) + lista expansível de eventos —
resultado (✓/!), ação, comunidade, responsável, data; ao expandir, detalhe
completo com metadados e contexto. Nota de retenção (ex.: "registros com
mais de 14 dias são excluídos automaticamente").

### 3.13 Publicação do sistema

**Propósito**: pipeline de publicação de versões do sistema, com aprovação
obrigatória em produção e rollback.

**Layout**:
1. KPIs: última publicada, aguardando aprovação, falhas em 30 dias,
   reversões automáticas.
2. Filtros: ambiente, situação, período.
3. Cabeçalho da publicação selecionada: ambiente/situação, versão,
   mensagem de commit, metadados (commit, branch, autor, início, duração).
4. **Trilha visual das 9 etapas** (Commit → Validação → Build → Testes →
   Prévia → Aprovação → Publicação → Verificação de saúde → Concluído),
   cada etapa com número, nome, status (sucesso/crítica/em andamento/
   pendente), duração e link "Ver logs".
5. Quando parada em Aprovação: painel destacado ("Esta publicação está
   parada esperando sua decisão") com campo de motivo e botões
   Aprovar/Recusar — visualmente impossível de ignorar.
6. Resultado dos testes + verificação de saúde lado a lado.
7. Comparação com a versão anterior no ar + ações (Liberar / Cancelar /
   Reverter publicação).
8. Tabela histórica de publicações (versão, ambiente, situação, commit,
   autor, início, duração, etapas concluídas/total, ações), com badges
   "reversão" e "automática" quando aplicável.
9. Bloco final de comparação entre versões publicadas, ordenado por versão
   semântica.

**Regra de design que não pode ser quebrada visualmente**: nada nesta tela
pode sugerir que uma publicação em produção avança sem aprovação — o botão
de publicar em produção sem aprovação registrada deve aparecer desabilitado
com tooltip explicando por quê.

### 3.14 Incidentes

**Propósito**: central que agrupa erros semelhantes num só registro com
contador, em vez de gerar centenas de alertas.

**Layout**:
1. KPIs: críticos em aberto, altos em aberto, total em tratamento,
   recorrentes.
2. Filtros: status, gravidade, área, período, busca por título/módulo.
3. Tabela: gravidade (badge), título, área/módulo, ocorrências (com selo
   "recorrente" quando ocorrências > 1), comunidades afetadas, última
   ocorrência, status, ações (Assumir/Mitigar/Resolver/Ignorar/Reabrir).
4. Ao expandir um incidente: descrição, histórico de ocorrências,
   comunidades afetadas (só nome + contagem), campo de resolução
   obrigatório ao resolver.
5. Destaque visual forte (borda esquerda vermelha) para gravidade Crítica.

**Estados**: vazio = "Nenhum incidente registrado — a central está ativa e
recebendo registros."

### 3.15 Publicações editoriais

**Propósito**: revisão, aprovação e programação de conteúdo editorial da
plataforma (fora do contexto de uma comunidade específica).

**Layout**: fila de rascunhos/agendados com preview, aprovação, calendário
de programação lateral.

### 3.16 Feedback e denúncias

**Propósito**: central de feedback/denúncias enviados por usuários.

**Layout**: lista filtrável por tipo/categoria/status, com resposta do
Proprietário e opção de abrir a publicação/comunidade relacionada.

### 3.17 Otimização

**Propósito**: diagnóstico e retenção segura de dados obsoletos, sem remover
dados ativos.

**Layout**: cartões de diagnóstico por categoria (sessões expiradas,
redefinições vencidas, etc.), com contagem e ação de limpeza.

### 3.18 Aparência

**Propósito**: identidade visual (paleta, logotipo, banner, papel de
parede) aplicada a uma comunidade específica ou a todas.

**Layout**: seletor de comunidade/global + preview ao vivo + controles de
cor/upload.

### 3.19 Laboratório

**Propósito**: prototipação isolada de telas, sem tocar dados reais.

**Layout**: lista de experimentos (ativos/arquivados), editor visual de
protótipo com dispositivos de preview (mobile/tablet/desktop/wide),
histórico de versões com checkpoint/restauração.

### 3.20 Configurações (Controle global)

**Propósito**: configuração global versionada, feature flags com liberação
gradual, manutenção por escopo, com reversão rápida.

**Layout**:
1. Formulário "Alterar uma configuração": seletor de chave (com badge
   "crítica" quando aplicável), escopo (Plataforma/Comunidade/Módulo),
   valor, motivo (obrigatório em críticas).
2. Tabela de valores vigentes: configuração, escopo, valor, versão,
   alterado por.
3. Bloco de feature flags: formulário (funcionalidade, escopo, estado,
   percentual de liberação 0–100%, janela de início/fim, motivo) + tabela
   de flags atuais.
4. Bloco "Reversão rápida": histórico combinado de configurações e flags,
   cada linha com botão "Reverter" que reaplica o estado anterior — nunca
   apaga a trilha, só cria um registro novo.
5. Nota fixa: "o percentual de liberação é determinístico por comunidade —
   a mesma comunidade nunca entra e sai do teste entre uma tela e outra."

---

## 4. Estados que precisam existir em TODA tela com dado dinâmico

Ao entregar os frames no Figma, cada tela de dado real precisa ter uma
variante para cada um destes 4 estados (não apenas o estado "feliz"):

1. **Carregando** — spinner discreto + texto contextual.
2. **Vazio** — ilustração/ícone simples + explicação do porquê + o que vai
   aparecer ali.
3. **Erro** — mensagem clara, sem jargão técnico, com ação de tentar de
   novo quando aplicável.
4. **Populado** — com dado real de exemplo (nunca "Lorem ipsum"; usar nomes
   fictícios óbvios, tipo "Comunidade Central (QA)", e-mails terminados em
   `.invalid`).

## 5. Responsividade — regra de conversão mobile

Para toda tabela: no breakpoint mobile (~720px), cada linha vira um cartão
com borda de 1px, e cada célula vira um par rótulo/valor em uma linha
(rótulo à esquerda em uppercase pequeno cor `faint`, valor à direita). A
barra de navegação lateral vira uma faixa horizontal rolável fixa abaixo do
topo, com os mesmos 20 itens na mesma ordem.

## 6. Entregáveis esperados do Figma

1. Uma página "Fundamentos" com as variáveis de cor (2 modos), estilos de
   texto, os 10 componentes-base da seção 1.6, em claro e escuro.
2. Uma página por grupo de navegação (6 grupos da seção 2), com os frames
   das telas daquele grupo — desktop (1440px) e mobile (390px) lado a lado.
3. Cada tela com as 4 variantes de estado da seção 4, quando aplicável.
4. Um protótipo clicável ligando a navegação lateral entre as 20 telas e os
   botões "Abrir" dos destaques da Visão Geral às telas correspondentes.
