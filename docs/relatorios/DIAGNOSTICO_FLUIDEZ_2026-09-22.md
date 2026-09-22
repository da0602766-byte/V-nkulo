# Diagnóstico de fluidez — 22/09/2026

## Escopo e método

- Site de produção, sessão já autenticada, navegador no mesmo computador e três navegações aquecidas por tela. Os números incluem rede, servidor e navegador; não são tempos isolados de SQL ou Web Vitals.
- `navegação`: chamada de abertura da URL concluída. `visível`: cabeçalho e conteúdo-alvo da tela presentes. Amostra pequena; a variação de rede pode ser grande.
- Não foram criados pedidos, alterados dados ou copiados perfis para medir. O painel de Desempenho atual não tem APM nem fonte real de consultas lentas; seus cartões não foram tratados como métrica.

| Tela | Navegação (ms) | Conteúdo visível (ms) | Mediana visível |
| --- | --- | --- | ---: |
| Painel inicial `/painel` | 3246, 3198, 3313 | 5771, 5463, 5806 (mural sem “Atualizando…”) | 5771 ms |
| Pedidos `/painel?view=solicitacoes` | 3408, 3359, 3266 | 6118, 6313, 6207 (“Meus pedidos”) | 6207 ms |
| Visitantes `/painel?view=visitantes` | 3488, 3974, 3682 | 3859, 4015, 3712 (“Relacionamento”) | 3859 ms |
| Diretório público `/comunidades` | 1972, 1265, 1256 | não medido separadamente | — |

## Causas identificadas no código

1. Toda leitura de sessão assinada fazia `SELECT` da sessão persistida e depois `SELECT` do usuário, sequenciais. O render do painel chama essa validação em duas camadas; portanto, o código anterior exigia quatro leituras D1 de autenticação. O teste integrado confirma duas leituras após a mudança, ambas com `JOIN`, preservando revogação e expiração.
2. A tela Pedidos só encerrava o esqueleto de “Meu espaço” depois de **ambas** as APIs: pedidos pessoais e Central operacional. A Central carrega fila paginada, métricas, responsáveis, ministérios e contato pastoral, que não são necessários para mostrar “Meus pedidos”.

## Mudança aplicada

- Sessão assinada: uma consulta com `LEFT JOIN` entre sessão persistida e usuário, preservando os motivos “sessão inválida” e “usuário ausente”, o hash da senha e a checagem de expiração. Sessões legadas permanecem sem alteração.
- Pedidos: as duas APIs ainda iniciam em paralelo, mas os pedidos pessoais encerram o esqueleto assim que sua resposta termina; a Central acrescenta controles e contato quando chega. Recarregamentos após uma alteração continuam esperando ambas.
- Nenhuma mudança na origem dos dados ou no Supabase; D1 segue como fonte de autenticação e autorização.

## Validação local

- TypeScript: aprovado. Lint dos arquivos alterados: zero erros, um aviso `<img>` preexistente em Pedidos.
- Build `vinext`: aprovado; artefatos `dist/server/index.js` e `dist/.openai/hosting.json` presentes.
- Suíte: **410/410** testes aprovados, incluindo revogação da sessão e carregamento progressivo de Pedidos.

## Medição após publicação

A preencher após a publicação validada; não afirmar ganho percentual antes de repetir a medição em produção.
