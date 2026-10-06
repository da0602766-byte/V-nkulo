# Carregamento: consultas concorrentes e imagens menores

Data: 03/10/2026. Base publicada: Sites 352, fonte `e763cf3902aa1df5fb87c8e4e1bc5ccb530a22af`.

## Alterações

O contexto de autorização esperava quatro consultas de permissões para então iniciar as leituras independentes de assinatura e módulos. Agora as seis leituras começam no mesmo lote. A composição de permissões, a aplicação das restrições de módulos e plano e a revogação continuam na mesma ordem. A consulta de acesso temporário, que pode persistir expiração e auditoria, continua separada e sequencial. Nenhum resultado de autorização é reutilizado entre requisições.

O painel também inicia a leitura de feature flags e da política editorial juntas. A precedência de escopos e as janelas de validade continuam sendo aplicadas depois das respostas.

A conversão de novas fotos no navegador usa estes limites, preservando proporção e transparência, sem ampliar imagens pequenas:

| Uso | Maior dimensão | Tamanho máximo da conversão |
| --- | --- | --- |
| Foto de perfil | 512 px | 160 KiB |
| Foto de publicação | 1920 px | 600 KiB |

Para esses dois usos, a qualidade WebP começa em 0,86 e cai progressivamente até 0,68 quando necessário; depois há tentativas com dimensões menores. Se nenhuma conversão atender ao limite, o envio apresenta erro. Papéis de parede, logos e evidências mantêm os parâmetros anteriores. As imagens já armazenadas não são reprocessadas; a mudança vale para novos envios. D1/R2, preferência de armazenamento pessoal, Supabase e políticas de cache não mudam.

## Evidências

- Build Worker/artefato Sites e TypeScript aprovados.
- ESLint dos três arquivos de aplicação e quatro arquivos de teste alterados: aprovado.
- 17 testes direcionados: aprovados. Incluem barreira de concorrência das seis consultas, flags/política editorial, isolamento do feed, revogação de vínculo/módulo na requisição seguinte, acesso temporário, limites de conversão, proporção, limpeza de bitmap e rejeição de arquivos inválidos.
- Suíte completa: 610 testes, 601 aprovados e nove falhas. As nove foram reproduzidas separadamente nos arquivos originais do commit base, sem este patch: teste de presença (`feed-interactions-access`), quatro expectativas antigas sobre feed/compositor/download (`feed-worship`, `v146`, `v189`, `v198`), três testes do carrossel (`p1-theme-accessibility`) e numeração documental de migrações (`pilot-database`). Não são regressões introduzidas aqui; a suíte geral não está totalmente verde.
- Uma asserção antiga do teste de imagens foi atualizada para a assinatura já existente `storeLocalMedia(prepared, preference.userId)`, preservando a verificação do isolamento por usuário.

Ensaio real de conversão no navegador, usando somente `public/cell-community-art.png` (1536×1024, 2.510.443 bytes), comparando o código original do commit base com o candidato:

| Uso | Conversão anterior | Nova conversão | Redução de bytes |
| --- | --- | --- | --- |
| Publicação | 433.494 bytes, 1536×1024 | 149.596 bytes, 1536×1024 | 65% |
| Perfil | 433.494 bytes, 1536×1024 | 19.900 bytes, 512×341 | 95% |

As prévias foram inspecionadas no navegador. Trata-se de uma única amostra de arte, não de uma média de fotos reais nem de medição do carregamento das páginas. A mudança remove uma etapa serial de consultas; o ganho de latência em produção ainda não foi quantificado. Logs locais ficam em `.task-tools/performance-tests-final.log`, `.task-tools/baseline-tests.log` e `.task-tools/image-browser-results.json` (ignorados pelo Git).

## Publicação

Publicada no Sites **353**, fonte `c5386419bfbed0e3b5ce7b1b9d042fa4e36c6732`, deployment `appgdep_6ac188a9b3c881918aff2b90b4fcda71`, confirmado como `succeeded` em 03/10/2026 às 19h59 Brasília. URL: `https://adote-gestao.da0602766.chatgpt.site`. Público anterior preservado. Registro documental posterior ao deploy; nenhuma migração de banco foi aplicada.
