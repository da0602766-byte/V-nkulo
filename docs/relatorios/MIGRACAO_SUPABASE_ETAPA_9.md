# Migração Supabase — etapa 9: caminho de autorização

Data: 29/09/2026.

## Alteração

O contexto de acesso já executava em paralelo quatro consultas D1 independentes para permissões ministeriais e de estacionamento. As leituras da assinatura da comunidade e dos módulos habilitados também usam a mesma comunidade e não dependem uma da outra; antes, eram executadas em sequência. Agora iniciam juntas com `Promise.all`, mantendo a aplicação e filtragem das permissões na mesma ordem.

Não houve mudança de regras de autorização, banco de origem, sessão ou sincronização Supabase. O D1 continua como fonte de verdade para login e permissões.

## Validação

- `npm run build`: aprovado; artefato Worker Sites validado.
- `npx tsc --noEmit`: aprovado.
- `node --test tests/*.test.mjs`: 557/557 testes aprovados.
- Teste de regressão confirma consultas paralelas e preservação da ordem de permissões.
- Esta mudança remove uma espera D1 serial do caminho crítico, mas o ganho no tempo total da autorização ainda não foi medido em produção. Não afirmar melhora quantificada de desempenho.

## Publicação

Publicada no Sites versão 339, commit `c172634b84f2f622c09bd6b5faee8b78bebf9c78`, deployment `appgdep_6abc691c54108191b904b3173cb02349`, em `https://adote-gestao.da0602766.chatgpt.site`.
