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

A preencher após TypeScript, lint, build, suíte completa e repetição da medição em produção.
