# Diagnóstico de fluidez do mural — 22/09/2026

## Achado

O painel já entrega as dez publicações iniciais no HTML por `initialFeed`. Depois da hidratação, `CommunityHome` inicia três leituras independentes: publicações, eventos e escalas pendentes. Embora as chamadas fossem disparadas em paralelo, o estado visual `Atualizando…` só terminava depois de todas as respostas e de seus JSONs.

Isso fazia uma agenda ou consulta de escalas mais lenta aparentar que o mural ainda não estava pronto, mesmo com publicações já visíveis. A medição da versão 293 registrou mediana de **5.991 ms** até desaparecer `Atualizando…`, sem melhora sobre a versão anterior.

## Mudança

- As três leituras continuam paralelas e usam as mesmas APIs, permissões e filtros.
- A resposta de publicações atualiza o feed, cursor e paginação e encerra o estado visual do mural imediatamente.
- Eventos e escalas atualizam somente suas próprias áreas quando chegam; uma falha auxiliar não apaga nem bloqueia as publicações.
- O primeiro feed entregue pelo servidor permanece visível durante a atualização.
- D1 continua como fonte. Não houve migração de dados nem mudança no Supabase.

## Validação

- TypeScript e build aprovados.
- Lint dos arquivos alterados: zero erros e dois avisos `<img>` preexistentes em `CommunityHome`.
- Suíte completa: **412/412** testes aprovados.
- Versão **294** publicada, commit `c69f530b4230730e0dfa6ca996252c091a8a420c`.

## Resultado em produção

Cinco navegações aquecidas para `/painel?view=inicio`, medindo até `Atualizando…` desaparecer:

| Amostra | Navegação | Feed pronto |
| ---: | ---: | ---: |
| 1 | 3.013 ms | 4.895 ms |
| 2 | 2.893 ms | 4.512 ms |
| 3 | 2.760 ms | 4.271 ms |
| 4 | 2.928 ms | 4.328 ms |
| 5 | 2.872 ms | 4.847 ms |

A mediana do feed pronto caiu de **5.991 ms** na versão 293 para **4.512 ms** na versão 294: redução observada de aproximadamente **25%**. A navegação mediana ficou em 2.893 ms. Publicações, o evento existente e o estado de escalas foram conferidos visualmente após a medição.

É uma amostra pequena sujeita à variação de rede e não substitui APM contínuo. O ganho confirma que eventos e escalas não precisam bloquear o estado visual do mural; não demonstra redução no custo interno dessas duas APIs.
