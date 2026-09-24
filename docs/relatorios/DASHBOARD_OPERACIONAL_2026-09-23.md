# Etapa 4 — Dashboard operacional

## Entrega

Amplia o painel existente em **Proprietário → Tempo real**. Indicadores de notificações por últimas 24 horas ou 7 dias, com seleção de Web, Android ou todos os canais. Inclui gráfico por hora/dia, tabela acessível, taxa de aceite, tempo médio/máximo até aceite, estados da fila, novas tentativas, atividade recente e estado dos conectores Firebase/Supabase.

## Definição das métricas

- Cada linha representa uma entrega de um aviso a um aparelho, classificada pelo estado atual e pela última atualização dentro do período. Não é uma contagem de eventos ou tentativas individuais.
- Taxa de aceite: aceitas / (aceitas + falhas + expiradas). Pendentes, em processamento e canceladas não entram no denominador.
- Tempo até aceite: diferença entre criação e última atualização de registros aceitos; inclui espera e tentativas, com precisão de segundos. Datas inconsistentes são excluídas da medição. Ausência de amostras aparece como “—”, distinta de zero.
- A fila atual respeita o canal, mas não o período. Assim, pendências antigas continuam visíveis.
- Intervalos e horários usam Brasília (UTC−03). Janelas móveis têm primeiro/último intervalo parcial: até 25 horas ou 8 dias representados.
- Aceite pelo provedor não comprova recebimento/exibição física. O histórico é operacional: limpeza após até 7 dias e exclusões de dispositivos, sessões ou avisos podem reduzir contagens. Não equivale a um histórico completo nem a SLA.
- Conectores mostram verificações existentes, independentes dos filtros; não executam novas chamadas aos provedores.

## Arquitetura e proteção

- GET `/api/proprietario/operacao` verifica sessão ativa e proprietário antes da leitura; filtros estritos; resposta `no-store`; falhas sanitizadas.
- Agregação no D1 por índice temporal já existente, sem migração. Séries limitadas a 25 pontos e atividade recente a 12 linhas. Nenhum conteúdo de mensagem, destinatário, endpoint, token ou chave devolvido.
- Cache oportunista de snapshots concluídos por 15 segundos, por binding D1 e combinação de filtros. Sem compartilhamento de promessas de I/O entre requisições Workers.
- Polling de 30 segundos, somente com tela visível e conexão disponível. Abort/timeout, espera crescente até 120 segundos após falhas e descarte de respostas de filtros antigos. Perda de autorização apaga dados e interrompe o polling; falha transitória preserva a última consulta com aviso.
- Gráfico SVG sem dependência adicional, tabela alternativa, seletores rotulados, cores por tokens de tema e layout móvel.
- Não altera Firebase, APK 1.7.1 nem credenciais em produção.

## Validação

Testes SQLite reais cobrem agregações, canais, janela temporal, fila antiga, ausência de amostras, cache, índice e limite de resultados. Testes da API cobrem permissões, filtros e falhas sanitizadas. Testes do cliente cobrem visibilidade/offline, cancelamento, filtros, respostas antigas, falhas temporárias e expiração de acesso.

Conferência visual local autenticada em 320, 390 e 1440 px: filtros funcionais, temas claro/escuro, gráfico legível, tabela acessível e ausência de transbordamento horizontal. Nenhum erro de console observado. A base local não tem registros de entrega; casos com dados são validados nos testes SQLite.

Validação final: **477 testes aprovados**, TypeScript limpo, build/artefato Sites aprovados e lint com zero erros. Os 86 avisos são preexistentes e incluem o checkout Android e probes ignorados pela publicação.

## Publicação

- Sites **303**, commit `0bdfe6a5dd87381727495e45d2e5cade0b50c0d0`.
- Deploy `appgdep_6ab4917c44008191aad65ed284d845b1`, concluído em 23/09/2026 às 23h57 (Brasília).
- URL: https://adote-gestao.da0602766.chatgpt.site/proprietario?tab=realtime
- Home HTTP 200; nova API sem sessão HTTP 401.
- Conferência autenticada em produção: 4 registros na janela inicial (2 aceitos Android, 1 falha Web, 1 cancelamento Web), média de aceite de 2 segundos; agendamento ativo; Firebase e Supabase verificados. São observações do momento, não garantias permanentes de disponibilidade.
- Filtros 7 dias/Android retornaram 2 registros aceitos, coerentes com gráfico e tabela. Conferência móvel com dados reais em 390 px sem transbordamento horizontal da página; tabela tem rolagem interna quando necessário. Nenhum erro de console observado.
- Repositório de origem Sites atualizado. Nenhuma alteração no repositório Android ou no APK.
