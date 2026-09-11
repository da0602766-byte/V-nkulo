# Relatório V118 — Visitantes, acompanhamento e categorias etárias

Data: 13/08/2026

## Resultado entregue

- O acompanhamento não abre mais em painel lateral separado.
- Cada visitante ocupa uma linha compacta e recolhível na lista.
- Ao expandir uma pessoa, contato, edição, ações, novo acompanhamento e histórico aparecem no próprio cadastro.
- Cartões internos e molduras repetidas foram substituídos por divisores, hierarquia tipográfica e seções recolhíveis.
- No celular, contatos usam duas colunas e formulários passam para uma coluna sem ultrapassar a largura da tela.

## Categorias automáticas

- A criação e a edição de categoria aceitam idade mínima e idade máxima inclusivas.
- A opção “Aplicar automaticamente” classifica o visitante pela data de nascimento.
- A mesma regra migra o visitante quando ele passa para outra faixa, por exemplo: TEEN até 16 anos e O2 a partir de 17.
- O backend rejeita faixas automáticas sobrepostas para não produzir classificação ambígua.
- Uma categoria informada manualmente continua disponível, mas uma faixa automática válida tem prioridade quando a data de nascimento está preenchida.
- A reconciliação automática é executada na comunidade ativa e registra auditoria quando altera cadastros.

## Segurança e isolamento

- Criação e edição das regras continuam protegidas por `visitor.categories.manage` no backend.
- Categorias, visitantes e migrações usam sempre o `comunidadeId` resolvido pela sessão.
- Uma categoria de outra comunidade é recusada mesmo quando seu identificador é enviado diretamente à API.
- Acompanhamentos preservam as permissões `followups.view` e `followups.manage`.

## Banco e migration

- `visitante_categorias.idade_minima` — inteiro opcional.
- `visitante_categorias.idade_maxima` — inteiro opcional.
- `visitante_categorias.migracao_automatica` — booleano, padrão falso.
- Migration gerada pelo Drizzle: `drizzle/0047_quick_ego.sql`.
- Nenhum cadastro, categoria ou acompanhamento existente é removido.

## Evidências de validação

- Build Vinext de produção: aprovado.
- Artefato Sites e migrations empacotadas: aprovado.
- ESLint: 0 erros; permanecem 38 avisos conhecidos de imagens dinâmicas já existentes.
- Suíte completa: 105 testes, 105 aprovados, 0 falhas.
- Teste funcional específico: criação de TEEN até 16 e O2 a partir de 17.
- Teste funcional específico: visitante de 16 anos recebe TEEN e migra para O2 ao mudar para 20 anos.
- Teste de segurança: categoria de outra comunidade é recusada.
- Teste de consistência: faixa 15–18 é recusada por sobrepor TEEN/O2.
- Teste estrutural responsivo: acompanhamento embutido, ausência do painel lateral e formulário móvel em uma coluna.

## Arquivos principais alterados

- `app/components/TenantOperations.tsx`
- `app/globals.css`
- `app/api/pilot/visitantes/route.ts`
- `app/api/pilot/visitantes/[id]/route.ts`
- `app/api/pilot/visitante-categorias/route.ts`
- `app/api/pilot/visitante-categorias/[id]/route.ts`
- `app/lib/visitor-category-rules.ts`
- `db/schema.ts`
- `drizzle/0047_quick_ego.sql`
- `drizzle/meta/_journal.json`
- `drizzle/meta/0047_snapshot.json`
- `tests/v118-visitors-inline-age-migration.test.mjs`

## Observação

A prévia interna iniciou corretamente, mas o navegador remoto de inspeção não concluiu o carregamento nesta execução. Isso não bloqueou a publicação porque build, artefato, banco, regras de permissão, responsividade estrutural e a suíte funcional integral foram validados automaticamente. A conferência final em aparelho físico continua recomendada após a publicação.
