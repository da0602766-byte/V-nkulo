# Auditoria dos endpoints legados de comunidade única — 08/09/2026

Classificação exigida antes de remover ou reescrever qualquer coisa. **Nenhum
arquivo foi removido nesta auditoria.** O documento existe para o proprietário
decidir com dado na mão.

## Resumo

O Vínkulo carrega hoje duas camadas de API completas:

- `app/api/pilot/*` — 79 rotas, sistema multi-tenant atual, isolamento por
  `comunidade_id` validado no servidor.
- `app/api/*` (fora de `pilot/`) — **45 rotas** do sistema anterior de
  comunidade única, herdadas do "ADOTE", sem nenhum filtro por comunidade.

As 45 rotas antigas estão **duplamente mortas** hoje:

1. **Bloqueadas por interruptor global.** `requireApiPermission` (em
   `app/lib/access.ts`) checa `PILOT_CONFIG.legacyModulesEnabled` — hoje
   `false` — antes de qualquer verificação de perfil ou permissão, e devolve
   HTTP 423 para todo mundo, inclusive `ADMIN`.
2. **Sem interface que as alcance.** Os 7 componentes que as chamam
   (`PortalModules`, `MinistryModules`, `ChurchServicesModule`, `TeensModule`,
   `NewsInteractions`, `TextBoxes`, `ScheduledMessagesManager`) são órfãos:
   nenhuma página do aplicativo os importa, direta ou indiretamente.

A alcançabilidade foi calculada percorrendo o grafo de imports a partir de
todas as `app/**/{page,layout,error,not-found}.tsx`, ignorando `import type`
(apagado no build) e incluindo `import()` dinâmico. Resultado: **74 dos 90
componentes são alcançáveis; 16 são órfãos**. Os 16 formam um cluster fechado
que só referencia a si mesmo — conferido também por busca direta de nome, sem
falso positivo.

**Peso morto total: ~8.804 linhas** (6.288 de componentes órfãos, 2.272 de
rotas legadas, 244 de `app/lib/access.ts`).

## Por que isso importa mesmo estando desligado

`/api/teens` devolve **nome, data de nascimento, nome dos pais e telefone de
menores de idade sem nenhum filtro de `comunidade_id`** — a consulta varre a
tabela `usuarios` inteira da plataforma. Enquanto o interruptor estiver em
`false` não há exposição. O risco é o interruptor ser religado por alguém que
queira reaproveitar um módulo antigo sem saber que essas rotas nunca foram
adaptadas ao multi-tenant. Por isso `tests/pilot-security.test.mjs` ganhou, na
rodada anterior, travas que falham se a flag voltar ou se a checagem sair de
`requireApiPermission`.

## Classificação rota a rota

### Classe A — já substituídas por equivalente `/api/pilot/*` (19 rotas)

Remoção segura do ponto de vista funcional: a funcionalidade existe hoje na
camada multi-tenant.

| Rota legada | Substituta atual |
| --- | --- |
| `/api/visitantes`, `/api/visitantes/[id]`, `/api/visitantes/[id]/pdf` | `/api/pilot/visitantes`, `/api/pilot/visitantes/[id]` |
| `/api/acompanhamentos`, `/api/acompanhamentos/[id]` | `/api/pilot/acompanhamentos` |
| `/api/celulas`, `/api/celulas/[id]` | `/api/pilot/celulas`, `/api/pilot/celulas/[id]` |
| `/api/diaconia`, `/api/diaconia/[id]`, `/api/diaconia/[id]/checklist`, `/api/diaconia/equipes`, `/api/diaconia/equipes/[id]`, `/api/diaconia/ranking` | `/api/pilot/diaconia`, `/api/pilot/diaconia/[id]/pdf` |
| `/api/notificacoes` | `/api/pilot/notificacoes` |
| `/api/usuarios`, `/api/usuarios/[id]`, `/api/usuarios/[id]/pdf`, `/api/usuarios/[id]/reset-link` | `/api/pilot/pessoas` |
| `/api/perfil`, `/api/perfil/tema` | `/api/pilot/pessoas/perfil`, `/api/pilot/community-theme` |

### Classe B — funcionalidade aposentada ou absorvida, sem equivalente direto (23 rotas)

Precisam de confirmação do proprietário de que a funcionalidade foi mesmo
aposentada antes de sumir do repositório.

| Rota legada | Situação |
| --- | --- |
| `/api/louvor`, `/api/louvor/[id]`, `/api/louvor/[id]/pdf` | Louvor virou um ministério comum; escalas e PDF hoje em `/api/pilot/escalas/[id]/pdf` |
| `/api/cultos`, `/api/cultos/[id]`, `/api/cultos/[id]/lancamentos`, `/api/cultos/[id]/lancamentos/[entryId]`, `/api/cultos/pdf` | Registro de rotinas de culto; sem equivalente no piloto |
| `/api/avisos`, `/api/avisos/[id]`, `/api/avisos/[id]/interacoes`, `/api/avisos/[id]/comentarios/[commentId]` | Avisos foram absorvidos pelo feed interno e por `avisos_promocao` da recepção |
| `/api/modulos`, `/api/modulos/[id]`, `/api/registros`, `/api/registros/[id]`, `/api/blocos-texto`, `/api/blocos-texto/[id]` | Abas e campos personalizados do sistema antigo; sem equivalente |
| `/api/mensagens`, `/api/mensagens/[id]`, `/api/configuracoes` | Mensagens programadas de exibição e configuração global antiga |
| `/api/relatorios/pdf` | Relatório do modelo antigo de dados |

### Classe C — não reativar como está (3 rotas)

| Rota legada | Situação |
| --- | --- |
| `/api/teens`, `/api/teens/acompanhamentos`, `/api/teens/acompanhamentos/[id]` | Dados de menores sem isolamento por comunidade. **Não pode ser religada em nenhuma hipótese sem reescrita.** Tem sobreposição conceitual com a futura Área Kids/Eventos: quando essa área for desenhada, decidir explicitamente entre migrar os dados de `teens_acompanhamentos` ou descontinuar. |

## Recomendação

1. **Classe A**: remover rotas e componentes órfãos correspondentes. Ganho
   imediato de manutenção, sem perda de funcionalidade.
2. **Classe B**: confirmar com o proprietário, uma linha por funcionalidade, se
   cultos/avisos/módulos personalizados/mensagens programadas estão aposentados.
   O que estiver, sai junto; o que não estiver, entra na fila de reescrita
   multi-tenant.
3. **Classe C**: manter desligada e tratar dentro do projeto da Área
   Kids/Eventos, nunca reativando o código atual.
4. Se a decisão for remover, remover **em um commit próprio**, separado de
   qualquer mudança funcional, para o rollback ser trivial.

Três desses componentes (`PortalModules`, `MinistryModules`,
`ChurchServicesModule`) foram explicitamente mantidos por decisão do Douglas
quando o `AdoteDashboard.tsx` foi removido (ver `docs/coordenacao/COORDENACAO_IA.md`,
linha de 06/09). Por isso nada foi removido agora sem nova decisão dele.

## Achado separado: funcionalidade viva sem interface

`/api/pilot/presenca` **não** é legada — é uma rota multi-tenant atual, com
isolamento por comunidade e teste dedicado (`presença comunitária isola tenants,
respeita privacidade e prioriza online`, em `tests/pilot-integration.test.mjs`).
Mas seu único consumidor, `CommunityPresencePanel.tsx`, é órfão: nenhuma página
o renderiza. Ou seja, o painel de quem está online existe no servidor, está
testado, e não aparece para ninguém.

Isso não é código morto para apagar — é uma decisão pendente: religar a
interface (recuperando a funcionalidade) ou aposentar rota, painel e teste
juntos. `PrivateChatDialog.tsx`, também órfão, é caso diferente: foi
substituído pelo popover de mensagens que o `PilotDashboard` implementa
diretamente (`pilot-message-popover`). A troca custou o minimizar/maximizar da
janela antiga, que o popover atual não tem.

## Itens bloqueados por dependência externa

- Confirmar na tabela de migrações aplicadas do D1 de produção o estado real
  antes de qualquer reconciliação do journal do Drizzle.
- `EXPLAIN QUERY PLAN` com volume de produção para a auditoria de índices.
- Adoção de `next/image` nos 43 `<img>` restantes: o vinext roteia imagens
  locais por `/_vinext/image`, que **depende do binding do Cloudflare Images em
  produção**. Sem esse binding provisionado, migrar só troca `<img>` funcional
  por imagem quebrada.
