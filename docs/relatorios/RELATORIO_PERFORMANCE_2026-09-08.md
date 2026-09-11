# Relatório de performance e estabilidade — 08/09/2026

Etapa 16 do script de otimização. **Todo número aqui foi medido nesta máquina,
com cenário semeado e reprodutível.** Onde não houve medição, está escrito que
não houve — nenhuma estimativa aparece como se fosse medida.

Branch: `claude/project-changes-updates-vsr287` · 11 commits · nada publicado.
Diferença total contra a `main`: 85 arquivos, 2.075 linhas adicionadas, 7.552
removidas, 52 arquivos apagados.

---

## 1. Antes — o que estava errado

### Gargalos de carga

| Onde | Problema |
| --- | --- |
| Painel (entrada) | O JavaScript entregue ao navegador carregava o runtime do Drizzle ORM e o `db/schema.ts` inteiro — todos os nomes de tabela apareciam em `dist/client` |
| Pessoas | Baixava até 2.000 registros por abertura e paginava, buscava e separava membros de oficiais dentro do navegador |
| Escalas | Teto de 150 escalas sem forma de pedir as seguintes, e uma consulta de designações **sem limite nenhum** |
| Central | Baixava o lote inteiro de escalas para exibir no máximo quatro cartões |
| Solicitações, Células, Eventos, Notificações, Acompanhamentos | Tetos fixos sem continuação: acima do teto, registros sumiam sem aviso |
| Ministérios e Equipes | Consulta em laço (N+1) na montagem de equipes |

### Defeitos encontrados durante a auditoria

Nenhum destes estava no script. Todos foram achados olhando o código para
otimizá-lo.

1. **Perda permanente de mensagens.** A migração de conversas para o Google
   Drive lia um único lote de 500 mensagens (`ORDER BY mp.id ASC LIMIT 500`,
   portanto as mais antigas) e em seguida executava
   `DELETE FROM mensagens_privadas WHERE conversa_id = ?`, apagando a conversa
   inteira. Numa conversa com mais de 500 mensagens, tudo que não coube no lote
   era apagado sem nunca ter subido.
2. **Dados de menores sem isolamento.** `/api/teens` devolvia nome, data de
   nascimento, nome dos pais e telefone de menores varrendo a tabela `usuarios`
   inteira da plataforma, sem filtro de `comunidade_id`.
3. **Contador de não lidas mentindo.** As notificações não lidas eram contadas
   sobre o lote carregado: quem tivesse mais de 60 não lidas via 60.
4. **Recurso vivo sem interface.** `/api/pilot/presenca` estava no ar, isolado
   por comunidade e coberto por teste, mas nenhuma página renderizava o painel.
5. **Perda silenciosa de registros.** Ministérios e Pedidos cortavam no teto sem
   qualquer indicação de que havia mais.

### Peso morto

45 rotas herdadas do sistema de comunidade única e 16 componentes órfãos —
alcançáveis por nenhuma página, e bloqueados por um interruptor global.

### Lint

0 erros. 43 avisos, todos `@next/next/no-img-element`.

---

## 2. Alterações

Cada linha: arquivo, problema, solução, risco, teste.

### Bundle

| | |
| --- | --- |
| **Arquivo** | `app/lib/community-theme.ts` → `app/lib/community-theme-storage.ts` |
| **Problema** | O arquivo abria com `import { getD1 }` e era importado como valor por `PilotDashboard` e `CommunityThemeEditor`, arrastando o Drizzle para o navegador |
| **Solução** | `getCommunityTheme()`, única função que toca no banco, foi para um arquivo próprio, importado só pelo servidor |
| **Risco** | Baixo: nenhuma assinatura, nome ou comportamento mudou |
| **Teste** | Conferido no build que `drizzle:entityKind` e `usuario_comunidades` não aparecem em nenhum arquivo de `dist/client` |

| | |
| --- | --- |
| **Arquivo** | `app/components/PilotDashboard.tsx` |
| **Problema** | `CommunityAdminWorkspace` e `EditorialSidebarSchedule` eram os dois últimos módulos condicionais ainda importados de forma estática |
| **Solução** | Passaram a `next/dynamic`, como os outros 13 |
| **Risco** | Baixo; o sidebar usa `loading: () => null` porque o esqueleto padrão tem tamanho de área de trabalho |
| **Teste** | Suíte completa |

### Paginação

| | |
| --- | --- |
| **Arquivos** | `app/api/pilot/pessoas/route.ts`, `app/components/PeopleWorkspace.tsx` |
| **Problema** | Até 2.000 registros por abertura; busca, abas e paginação no navegador |
| **Solução** | Cursor no par `(nome, membership_id)`, que é a própria ordenação. Busca e abas foram para o SQL; os contadores do topo viraram agregação, porque contar sobre o lote passaria a mentir. A tela trocou numeração de páginas por "Carregar mais", com espera de 300 ms na busca |
| **Risco** | Médio — mexe em busca, filtro e contadores ao mesmo tempo. Mitigado por teste que percorre a paginação inteira |
| **Teste** | Novo: exige que cada pessoa apareça exatamente uma vez em toda a paginação, sem pular nem repetir, com isolamento por comunidade válido em todos os lotes e cursor corrompido caindo no primeiro lote |

| | |
| --- | --- |
| **Arquivo** | `app/api/pilot/escalas/route.ts` |
| **Problema** | Teto de 150 sem continuação, e uma consulta de designações sem limite algum, que trazia as designações de todas as escalas visíveis para o JavaScript descartar quase tudo |
| **Solução** | Cursor em `(inicia_em, id)`; designações restritas às escalas do lote, que já passaram pela regra de visibilidade. O filtro por comunidade continua como segunda barreira |
| **Risco** | Baixo: o descarte que era feito em memória passou a ser feito no `WHERE` |
| **Teste** | Novo: exige que as designações pertençam só às escalas entregues no lote e que nenhuma escala seja pulada ou repetida |

| | |
| --- | --- |
| **Arquivos** | `app/api/pilot/escalas/route.ts`, `app/components/CommunityHome.tsx` |
| **Problema** | A Central baixava o lote inteiro para exibir no máximo quatro cartões |
| **Solução** | `filtro=minhas-pendentes` resolve no SQL as três condições que a tela aplicava depois de receber tudo; a Central pede `limite=4` |
| **Risco** | Médio — um filtro de visibilidade mal escrito esconderia escala legítima ou mostraria escala alheia |
| **Teste** | Novo: exige que escala de outra pessoa, já respondida, encerrada ou em rascunho fiquem de fora, **e que a listagem sem filtro continue entregando tudo** — o filtro reduz o que é pedido, não o que a pessoa pode ver |

| | |
| --- | --- |
| **Arquivos** | `solicitacoes`, `notificacoes`, `acompanhamentos`, `eventos`, `celulas` |
| **Problema** | Tetos fixos sem continuação |
| **Solução** | Cursor em cada uma. Em Solicitações o cursor carrega `(grupo de status, id)`, porque a ordenação agrupa por status antes de descer por id e um cursor só com id pularia registros ao trocar de grupo. Em Células foi paginado o histórico de relatórios, único dos quatro conjuntos da tela que cresce indefinidamente |
| **Risco** | Baixo |
| **Teste** | Novo para notificações, incluindo o contador de não lidas |

### Correções de defeito

| | |
| --- | --- |
| **Arquivo** | `app/api/pilot/chat/route.ts` |
| **Problema** | Migração para o Drive apagava a conversa inteira depois de subir só um lote |
| **Solução** | O laço avança por lotes com `mp.id > ?` e cada lote só é apagado depois de ter subido, então uma falha no meio deixa o restante intacto |
| **Risco** | Baixo, e o risco de **não** corrigir era perda permanente de dados |
| **Teste** | Novo: trava a exclusão indiscriminada. É teste de código, não de execução, porque a migração depende do Google Drive, ausente do ambiente de teste |

| | |
| --- | --- |
| **Arquivo** | `app/api/pilot/notificacoes/route.ts` |
| **Problema** | Não lidas contadas sobre o lote |
| **Solução** | Consulta própria, com colunas estreitas, reaproveitando a mesma função de categoria para não existirem duas versões da regra |
| **Risco** | Baixo |
| **Teste** | Novo: cria 80 não lidas e exige que o contador diga 80 com lote de 60 |

| | |
| --- | --- |
| **Arquivos** | `app/api/teens/**` (removidos), `tests/pilot-security.test.mjs` |
| **Problema** | Dados de menores sem filtro de comunidade |
| **Solução** | Rotas removidas. A trava anterior exigia que ficassem atrás do interruptor de módulos legados; agora vigia a **ausência** dos arquivos |
| **Risco** | Baixo: estavam inacessíveis por interruptor global |
| **Teste** | Reescrito para falhar se os arquivos voltarem |

| | |
| --- | --- |
| **Arquivos** | `CommunityPresencePanel.tsx`, `CommunityHome.tsx`, `PilotDashboard.tsx`, `PrivateChatWorkspace.tsx` |
| **Problema** | Rota viva, testada, sem nenhuma tela que a renderizasse |
| **Solução** | Painel montado na trilha lateral da Central, dentro do bloco `!readOnlyFeed` — mesma regra que a rota aplica no servidor. O botão Mensagem dispara `vinkulo:open-chat` e o painel leva ao chat existente, em vez de abrir uma segunda tela de conversa |
| **Risco** | Baixo |
| **Teste** | Novo: **não basta o componente existir e a rota responder — uma tela alcançável precisa montá-lo** |

### Limpeza

45 rotas legadas e 16 componentes órfãos avaliados um a um em
`AUDITORIA_ENDPOINTS_LEGADOS_2026-09-08.md`. Removidos 52 arquivos.
`/api/cultos*` foi **mantido** por decisão do proprietário: a funcionalidade
ainda serve e não há equivalente no piloto.

Duas remoções foram revertidas dentro do próprio trabalho, por erro na varredura
inicial: `PrivateChatWorkspace.tsx` (é a aba Mensagens; escapou porque o painel a
carrega via `dynamic()`) e `app/api/conta/perfil/route.ts` (nunca esteve na
auditoria; foi pego por uma busca por pasta chamada `perfil`).

### Segurança

Varredura das 113 rotas. **Nenhum IDOR encontrado.** A entrega não é o parecer, e
sim `tests/tenant-isolation-guard.test.mjs`: o teste lê as 53 tabelas com
`comunidade_id` direto do schema versionado e falha quando qualquer rota do
piloto endereça um registro dessas tabelas com `id = ?` sem filtrar
`comunidade_id`. As seis exceções conferidas exigem motivo escrito, e o teste
também falha quando uma exceção deixa de corresponder a alguma consulta, para
nenhuma virar permissão silenciosa.

A trava foi verificada injetando uma violação proposital
(`UPDATE celula_relatorios ... WHERE id = ?`): falhou como esperado e voltou a
passar com a violação removida. Ela já provou o valor ao apontar
`app/api/pilot/redes/route.ts`, que havia escapado da conferência manual —
legítima, com escopo por rede, e agora registrada com o motivo.

---

## 3. Depois — medições

Todas reproduzíveis com o harness de teste (`tests/helpers/sqlite-d1.mjs`).

### Bundle

Grafo estático por entrada, seguindo só imports estáticos a partir do chunk de
cada entrada; `import()` dinâmico fora da conta.

| Entrada | Antes | Depois | Diferença |
| --- | --- | --- | --- |
| `painel` | 498,8 KB | 388,7 KB | **−110,1 KB (−22,1%)** |

### Pessoas — comunidade semeada com 500 membros

| | Registros | Payload | Consulta |
| --- | --- | --- | --- |
| Antes | 501 | 161,7 KB | 1,30 ms |
| Depois | 30 | 9,6 KB | 0,31 ms |

O tempo do "depois" já inclui a consulta extra de contadores.

### Escalas — designações · 400 escalas com 5 designações cada

| | Linhas | Payload | Consulta |
| --- | --- | --- | --- |
| Antes | 2.000 | 471,0 KB | 3,38 ms |
| Depois | 750 | 175,9 KB | 1,45 ms |

Eram **1.250 linhas buscadas no banco para o JavaScript jogar fora** — e, sem
limite, esse número crescia indefinidamente com o histórico da comunidade.

### Central — 400 escalas na comunidade

| | Escalas | Designações |
| --- | --- | --- |
| Antes | 150 | 753 |
| Depois | **3** | **18** |

É a tela que todo membro abre a cada acesso, então o ganho se multiplica por
pessoa e por visita.

### Código e qualidade

| | Antes | Depois |
| --- | --- | --- |
| Arquivos removidos | — | 52 |
| Linhas | — | −7.552 (+2.075) |
| Erros de lint | 0 | 0 |
| Avisos de lint | 43 | 41 |
| Testes | 317 | **329** |

Os 41 avisos restantes são todos `@next/next/no-img-element` e estão bloqueados
por infraestrutura externa: o `vinext` roteia imagens locais por
`/_vinext/image`, que depende do binding do Cloudflare Images. Sem esse binding
provisionado, migrar troca `<img>` funcional por imagem quebrada.

### Não medido

Por honestidade, o que **não** foi medido:

- Tempo de resposta ponta a ponta das 14 áreas que a Etapa 1 lista. Foram
  medidas quatro: bundle do painel, Pessoas, Escalas e Central.
- Tempo de renderização no navegador. Exige execução real com aparelho e rede,
  fora deste ambiente.
- Comportamento com volume de produção. Todas as medições usam cenário semeado
  localmente; a forma dos ganhos se mantém, a escala não é comparável.

---

## 4. Pendências

### Bloqueadas por dependência externa

| Etapa | Bloqueio |
| --- | --- |
| 4 — Índices | Exige `EXPLAIN QUERY PLAN` com volume de produção |
| 5 — Drizzle | Procedimento verificado e documentado em `drizzle/README.md`; aplicar exige confirmar no D1 de produção quais migrações rodaram |
| 10 — Imagens | Depende do binding do Cloudflare Images |
| Publicação | Credencial temporária, de quem tem acesso ao Sites |

### Decisão de desenho pendente

`RequestsWorkspace` junta duas fontes (repositórios e solicitações gerais) e
ordena o resultado misturado no cliente. **Uma ordenação de duas fontes não pode
ser paginada paginando só uma delas** — sai na ordem errada. "Carregar mais"
recupera o que faltava, mas a paginação real dessa tela depende de unificar as
duas no servidor. Isso é decisão de desenho, não conserto pontual, e por isso
está registrado em vez de improvisado.

### Etapas não iniciadas

7 (re-renders e hidratação), 8 (cache interno), 9 (chat incremental — a migração
foi corrigida, o carregamento sob demanda não), 13 (responsividade), 14
(acessibilidade), 17 (Novo Login e Área Kids/Eventos).

---

## 5. Recomendação para a próxima etapa

**Etapa 13, responsividade.** É a única etapa restante que depende de olhar a
aplicação rodando, e o painel de presença — a única mudança visível deste
trabalho — precisa ser conferido nas cinco resoluções antes de publicar. As
demais etapas restantes são internas e podem esperar.

Depois dela, a Área Kids/Eventos (Etapa 17) tem prioridade sobre as otimizações
que sobraram: ela carrega a decisão pendente sobre os dados de menores, cujo
código antigo foi removido nesta rodada justamente por não ter isolamento por
comunidade.
