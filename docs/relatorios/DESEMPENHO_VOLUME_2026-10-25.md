# Desempenho com volume — 25/10/2026

Base: Sites 434, fonte 845097a895946ff781d5bf93a05ca37ccfa47ae1. Publicação autorizada; APK físico adiado.

## Método

Worker compilado executado localmente, Node v24.19.0, adaptador D1 sobre SQLite em memória. Três bases independentes de 100, 1.000 e 10.000 pessoas fictícias, além da conta administrativa. Cada pessoa tem três vínculos ministeriais e três designações; a base maior contém 30 mil de cada. Há um evento por pessoa, metade em janeiro e metade em março de 2099. A agenda consulta janeiro e limita cada camada a 400 registros. As escalas pertencem às pessoas fictícias, não ao administrador consultante; a medição da agenda representa principalmente a camada de eventos.

Cinco notificações por pessoa são destinadas ao administrador: até 50 mil notificações, metade lida. Cinco categorias, datas repetidas e nomes de pessoas inseridos em ordem inversa para exercitar ordenação. Esse é um cenário sintético de volume; não é uma distribuição extraída de clientes reais.

Cada cenário usa duas requisições de aquecimento e sete amostras medidas. Tabela mostra medianas. O tempo inclui Worker, autenticação local, consulta, transformação e resposta, além da instrumentação idêntica de linhas/bytes retornados pelo adaptador. Não inclui rede, latência Cloudflare, concorrência, renderização de navegador ou tempo de APK. Linhas retornadas não equivalem a linhas examinadas pelo SQLite. EXPLAIN QUERY PLAN foi coletado fora do intervalo cronometrado. Os ensaios antes/depois foram sequenciais, sem executar a suíte em paralelo com a medição final.

## Resultados

| Pessoas na base | Consulta | Antes (ms) | Depois (ms) |
| ---: | --- | ---: | ---: |
| 100 | Pessoas | 3.07 | 2.97 |
| 100 | Pessoas com escala | 2.84 | 2.34 |
| 100 | Agenda | 1.58 | 1.54 |
| 100 | Notificações | 3.58 | 2.28 |
| 1000 | Pessoas | 7.03 | 2.72 |
| 1000 | Pessoas com escala | 8.31 | 3.67 |
| 1000 | Agenda | 3.76 | 3.49 |
| 1000 | Notificações | 20.23 | 6.68 |
| 10000 | Pessoas | 56.21 | 7.87 |
| 10000 | Pessoas com escala | 68.83 | 21.02 |
| 10000 | Agenda | 5.07 | 5.03 |
| 10000 | Notificações | 185.70 | 56.81 |

Na base maior, Pessoas caiu aproximadamente 86% e o filtro com escala 69%; Notificações caiu 69%. A Agenda foi mantida, com resultado essencialmente estável (~5 ms).

A rota de notificações antes recebia 25.062 linhas somando consultas (25 mil só para o contador), cerca de 1.719.667 bytes serializados pelo adaptador. Depois recebe 63 linhas e 15.255 bytes quando todas as categorias estão habilitadas: o contador retorna uma linha. Com preferências filtradas, o contador retorna no máximo cinco linhas, preservando as categorias. O ensaio intermediário com classificação de todas as categorias ficou em ~131 ms no cenário maior; não atribuir a essa modalidade os 57 ms da contagem simples. A classificação e a varredura do histórico ainda crescem com o volume.

A resposta HTTP da página de notificações continua com 60 itens e 25 mil não lidas. A redução é na transferência entre banco e aplicação, sem truncar a contagem para ganhar velocidade.

## Correções

- Pessoas: materializar primeiro os IDs filtrados, ordenados e limitados; calcular ministérios e próximas escalas somente para o lote. Busca, filtros, cursor, totais, hierarquia e permissões mantidos.
- Notificações: selecionar IDs da página antes de buscar remetente e estado de leitura. Contar no SQL; com todas as categorias ativas, dispensar a classificação por título. Com filtros, agregar por categoria com a mesma precedência da classificação JavaScript.
- Regras de categoria compartilhadas em notification-category.ts, incluindo ORAÇÃO com caixa mista. Visibilidade de avisos do proprietário permanece aplicada antes de paginação e contagem. Não há cache compartilhado ou alteração de autenticação.
- Nenhuma migração de esquema, alteração visual, dado real ou APK modificado.

## Verificação

- **870/870 testes** aprovados. Quatro novos testes cobrem paginação com nomes repetidos, inativos e outro tenant; filtros e vínculos; contador limitado em volume; preferências, privacidade, leitura e cursor; equivalência das categorias com caixa/acentos; execução de SQL materializado no D1/workerd.
- Comparação adicional executou a SQL antiga e a nova na mesma base de 10 mil pessoas: linhas idênticas nas páginas de Pessoas, Pessoas com escala e Notificações.
- TypeScript e build aprovados. Lint: zero erros e 38 avisos preexistentes. Diff sem erros de whitespace.
- Validação desta alteração concentrada em APIs/SQL; não foi uma medição de renderização das telas nem de carga simultânea na hospedagem.

## Reprodução e evidências

Após compilar, executar: node scripts/performance/measure-volume.mjs .task-tools/perf-final.json

O runner só cria banco fictício em memória. Não recebe conexão de produção e não chama serviços externos. Relatórios locais: .task-tools/perf-before.json, perf-after.json (intermediário), perf-final.json, respectivos logs, perf-build.log, perf-types.log, perf-lint.json e perf-tests.log. JSON inclui tempos por consulta, linhas/bytes retornados e planos. Testes: tests/performance-volume.test.mjs.

## Pendências

Ainda faltam carga concorrente, múltiplas comunidades com distribuição representativa, outras rotas, mídia, renderização e latência real da hospedagem. Consultas de busca, filtros e contadores ainda examinam históricos; este bloco não torna o custo constante. APK físico permanece adiado.

## Publicação

Validação concluída; publicação em preparação.
