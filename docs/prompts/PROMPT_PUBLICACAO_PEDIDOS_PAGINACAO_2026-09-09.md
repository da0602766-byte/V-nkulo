# Prompt de publicação — para o Codex

Copie daqui para baixo.

---

Você vai publicar a rodada de **paginação, busca e contadores reais da aba
Pedidos**, pronta e validada no branch
`claude/pedidos-pagination-search-scale-abvf3h` do repositório
`da0602766-byte/V-nkulo`. O pull request está aberto:
**https://github.com/da0602766-byte/V-nkulo/pull/12** (5 commits à frente da
`main`).

## Antes de tudo: não há migração

**Nenhuma alteração de banco.** Não rode `drizzle-kit generate`, não aplique
nada em `drizzle/` e não mexa no journal. Toda a mudança é em consulta SQL
sobre tabelas já existentes (`solicitacao_repositorio_itens`,
`solicitacoes_comunidade`, `solicitacao_eventos`) e nenhum dado foi movido,
apagado ou reestruturado.

## O que publicar

A Central de Oração/Visita (`/api/pilot/solicitacoes/central`) tinha `LIMIT
250` fixo nos itens e `LIMIT 1200` nos eventos, sem cursor, busca ou filtro no
SQL — exatamente o cenário que a tarefa original de escalabilidade descrevia.
Acima desses tetos, registros antigos ficavam **permanentemente inacessíveis**
(sem forma de pedir o restante) e o histórico de um item muito ativo podia ser
truncado em silêncio. `/api/pilot/solicitacoes` (Meus Pedidos + solicitações
gerais) já tinha cursor real desde a rodada de 08/09, mas sem contador
agregado para essa segunda fonte da tela.

### O que mudou

1. **Central: cursor real** por (grupo-final, grupo-urgência, id) — a
   ordenação usa três chaves (pendente antes de finalizado, urgente antes de
   normal, id decrescente), então um cursor de duas chaves pularia itens ao
   trocar de grupo de urgência dentro do mesmo grupo final.
2. **Busca e filtros movidos para o SQL**: `busca` (título, descrição, nome do
   solicitante, nome do responsável, resultado, mensagem de atendimento),
   `tipo`, `status`, `responsavel`/`semResponsavel`, `desde` (período) e
   `estado` (urgentes/pendentes/acompanhamento/retorno/concluídos) — todos
   resolvidos sobre a fila inteira da comunidade, combinados em AND.
3. **Contadores agregados por `COUNT`/`SUM`**, sem os filtros do lote — os
   cartões ("Total em aberto", "Urgentes", "Visitas pendentes", "Atendidos
   hoje") e as contagens das abas agora representam a fila real, não
   `array.filter(...).length` sobre o que já tinha carregado.
4. **Eventos restritos ao lote atual**: antes buscavam até 1200 eventos de
   *toda a comunidade* a cada carregamento; agora só os do lote de itens
   exibido (`IN` com os ids da página, sempre bem abaixo do limite seguro de
   parâmetros do D1 que o projeto já respeita noutros pontos).
5. **Solicitações gerais** (aconselhamento, apoio, ministério, outro — a
   segunda fonte da tela): novo `contadoresGerais`, com a mesma visibilidade
   da listagem já existente, para os cartões somarem as duas fontes.
6. **Frontend** (`RequestsWorkspace`): busca com debounce de 300 ms e
   cancelamento de resposta antiga (`AbortController` + contador de
   requisição, mesmo padrão já usado no feed de `CommunityHome`); botão
   "Carregar mais orações e visitas"; "Carregar mais" passou a existir também
   na visão do membro (Meus Pedidos), que antes só existia na visão
   operacional; cartões e abas somam os contadores dos dois endpoints.

### Desempenho (medido, com cenário semeado de 300 itens)

| | Antes | Depois |
| --- | --- | --- |
| Itens no primeiro carregamento | 250 (fixo, sem cursor) | 50 (`nextCursor` leva ao resto) |
| Payload da 1ª página | 263,0 KB | 53,3 KB (−80%) |
| Itens acima do 250º | inacessíveis para sempre | alcançáveis por "Carregar mais" |
| Eventos por carregamento | até 1200 de toda a comunidade | só os do lote atual |
| `contadores.total` no 1º lote | inexistente | 300 (o total real) |

## O que foi preservado do seu trabalho

- Nenhuma regra de permissão, autenticação ou isolamento entre comunidades
  mudou. Todo filtro novo é uma condição em **AND** sobre a mesma visibilidade
  (`solicitante_id`, destinatário, escopo de gestão/ministério) que já
  existia — testado explicitamente que busca e filtro nunca ampliam o que um
  membro comum ou um responsável de ministério podem ver.
- `/api/pilot/solicitacoes` (Meus Pedidos) **não teve a query alterada** —
  só ganhou o campo novo `contadoresGerais` na resposta.
- Nenhuma outra área foi tocada: autenticação, Google/Drive, APK, Novo Login,
  Área Kids/Eventos ficaram intactos.

## Decisão de escopo — registrada, não improvisada

A tela ainda combina **duas fontes** (repositório de oração/visita + tabela
de solicitações gerais) e o merge/ordenação final acontece no navegador. Essa
limitação já era conhecida (registrada em rodada anterior sua/dela como
"decisão de desenho, não conserto pontual"). Nesta rodada, busca e filtros só
foram movidos para o servidor na fonte de maior volume (o repositório de
oração/visita, que é onde a tarefa original concentra o risco de escala); a
fonte "solicitações gerais" continua filtrada no navegador sobre o lote já
carregado. Unificar as duas fontes num único fluxo paginado no servidor segue
como pendência de desenho, não uma correção que faltou.

## Validação já executada

```
1. TypeScript          limpo (build aprovado)
2. Lint                0 errors, 41 warnings (igual ao baseline antes desta rodada)
3. Build e artefato    aprovado (Worker ESM e hosting.json presentes)
4. Suíte de testes     344 passaram, 0 falharam (eram 341; 3 novos, nenhum removido)
```

Os 41 avisos são todos `@next/next/no-img-element`, já bloqueados por
infraestrutura (binding do Cloudflare Images em produção) — não são novos
desta rodada.

## Passos

1. `git fetch origin claude/pedidos-pagination-search-scale-abvf3h`
2. Confira o diff contra `main` (5 commits, `app/api/pilot/solicitacoes/central/route.ts`,
   `app/api/pilot/solicitacoes/route.ts`, `app/components/RequestsWorkspace.tsx`,
   `tests/pilot-integration.test.mjs`, `docs/coordenacao/COORDENACAO_IA.md`).
3. **Não aplique migração.** Esta rodada não tem nenhuma.
4. Integre em `main` pelo PR #12 e publique no Sites pelo fluxo do
   `docs/coordenacao/COORDENACAO_IA.md` — credencial temporária por comando,
   nunca gravada em arquivo, log, commit ou URL.
5. Depois do push, `fetch` e confirme que `HEAD` e `origin/main` apontam para
   o mesmo commit antes de declarar concluído.
6. Registre a versão publicada na linha do Claude (2026-09-09) em
   `docs/coordenacao/COORDENACAO_IA.md`.

## Verificação depois de publicar

- Em **Pedidos → Atendimento**, os cartões do topo e as contagens das abas
  (Todos, Orações, Visitas, Urgentes, Pendentes, Em acompanhamento, Aguardando
  retorno, Já atendidos) continuam corretos mesmo numa comunidade com mais
  pedidos de oração/visita do que um lote — se não houver como testar com
  volume real, ao menos confira que os números batem com o que aparece na
  tela.
- Digitar na busca encontra pedidos que não estão na lista visível no
  momento (sem precisar rolar ou clicar em "Carregar mais" antes).
- Os filtros avançados (status, responsável, período, "sem responsável") e as
  abas rápidas continuam funcionando, e "Carregar mais orações e visitas"
  aparece quando há mais itens do que o lote.
- Em **Meus Pedidos** (visão do membro), "Carregar mais" aparece quando a
  pessoa tem mais solicitações do que o lote, e continua mostrando só o que é
  dela.
- Um membro comum continua sem enxergar a fila operacional (nem pelos
  cartões, nem pela busca) em nenhuma comunidade.

Se algo dessa lista falhar, os cinco commits desta rodada estão isolados por
finalidade (Central, solicitações gerais, frontend, testes, documentação),
então é possível isolar qual bloco introduziu o problema.
