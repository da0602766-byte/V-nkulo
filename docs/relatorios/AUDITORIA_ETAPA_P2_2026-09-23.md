# Auditoria — etapa P2: entrega durável de notificações

Data: 23/09/2026. Base: versão 298, commit `bd8c57dceda69587975331b1558854f8357af25b`.

## Resultado implementado

Novas notificações individuais passam a gerar trabalho persistente por aparelho, na mesma transação do aviso. O servidor pode retomar uma execução interrompida, reagendar falhas temporárias e apresentar o diagnóstico em **Proprietário → Tempo real → Entrega de notificações**.

A etapa anterior dependia exclusivamente da execução em segundo plano após a requisição. `waitUntil` tem uma janela limitada no Worker; não é armazenamento durável. Agora ele antecipa a tentativa, enquanto o D1 mantém o trabalho pendente. [Documentação do contexto do Worker](https://developers.cloudflare.com/workers/runtime-apis/context/).

## Caminho da entrega

1. O trigger da migração `0078_push_delivery_queue.sql` insere uma entrega para cada inscrição elegível da conta destinatária, inclusive quando outro módulo insere diretamente em `notificacoes_sistema`.
2. Não há reenvio de avisos anteriores à migração. Chat e avisos sem destinatário individual continuam fora deste transporte.
3. O consumidor obtém um bloqueio global com validade de 60 segundos e reserva até oito itens por execução. Envia em duas ondas de quatro requisições, com timeout de cinco segundos por chamada HTTP.
4. Antes de enviar, consulta novamente usuário ativo, sessão, aparelho, vínculo, prazo e leitura do aviso. As gravações finais exigem o token da execução atual; uma resposta antiga não pode apagar um vínculo substituído ou sobrescrever a nova execução.
5. Aceite HTTP 2xx encerra o item. Rede/timeout, 408, 429 e 5xx permitem até cinco chamadas ao serviço. A espera começa em 30 segundos, cresce exponencialmente e recebe até 20% de variação; `Retry-After` pode ampliá-la. Prazo total: 24 horas.
6. Respostas 404/410 removem somente a inscrição exata ainda pertencente à execução. A remoção em cascata também elimina seu histórico da fila.
7. Itens encerrados há mais de sete dias são removidos em lotes de até 500, durante o processamento. A notificação da central é preservada. A remoção depende de execuções disponíveis, portanto não é uma garantia de exclusão no instante exato de sete dias.

O payload continua genérico, sem título ou mensagem particulares. A autorização também permanece no service worker, antes da exibição e do clique. `Topic` e tag estável agrupam o mesmo aviso; `renotify: false` evita novo alerta sonoro quando a tag é substituída. A urgência alta fica restrita a avisos classificados como importantes. Os cabeçalhos seguem os mecanismos de TTL, urgência, substituição e espera definidos pelo [protocolo Web Push](https://www.rfc-editor.org/rfc/rfc8030.html).

## Processamento sem tela aberta

O endpoint autenticado já chamado pelo agendamento Supabase a cada cinco minutos agora executa também a fila. A tentativa de processar push não depende do sucesso da sincronização dos catálogos. Nenhum novo serviço pago ou agendamento foi criado.

Há três oportunidades de execução: após criar um aviso pelo helper, com tráfego elegível (limitado a uma verificação a cada 30 segundos por instância), e pelo job existente. O bloqueio persistente impede consumidores simultâneos normais. Interrupções deixam o item recuperável após o vencimento da reserva.

## Diagnóstico e interface

- `GET /api/proprietario/notificacoes`: exclusivo do proprietário autenticado e ativo; `Cache-Control: no-store`.
- Contadores por estado, horário da consulta, última execução agendada, último processamento e próximo horário elegível. Sem inventar zeros antes de obter dados.
- Até 12 registros operacionais recentes, sem mensagens, destinatários, endpoints ou credenciais. Contadores representam o histórico retido, não métricas vitalícias.
- Consulta a cada 30 segundos somente com tela visível e conexão; requisições abortadas ao ocultar/sair; falhas ampliam o intervalo para 60/120 segundos. Erro conserva a última leitura identificada; perda de autorização limpa os dados exibidos.
- Ausência de heartbeat por 12 minutos é mostrada explicitamente. Aceite pelo serviço não é apresentado como confirmação de exibição no aparelho.
- Componentes usam os tokens claro/escuro existentes, botão com 44 px e grade adaptável. O indicador neutro recebeu fundo semântico próprio após a conferência de contraste.

## Validação

- `scripts/pre-publicacao.sh`: TypeScript limpo, lint com 0 erros e 43 avisos preexistentes; build e artefato aprovados; **458/458 testes aprovados**.
- Dez testes novos: atomicidade/rollback, unicidade, concorrência, limite de lote, retomada de reserva expirada, resposta antiga, backoff/Retry-After, limites de tentativas, autorização, retenção, diagnóstico e suspensão de polling. Testes anteriores de privacidade e do agendamento foram adaptados e continuam aprovados.
- Runtime D1/Miniflare: migração 0078 aplicada; trigger, rollback de batch e `UPDATE ... RETURNING` verificados em banco isolado. [Referência de testes locais D1](https://developers.cloudflare.com/d1/best-practices/local-development/).
- Navegador local: diagnóstico carregado, consulta automática observada, botão de 44 px; larguras de 320, 390 e 1440 px sem transbordamento horizontal; temas claro e escuro conferidos. O ambiente local, sem VAPID, exibiu corretamente o estado não configurado.
- Nenhuma notificação de teste foi enviada a usuários reais.

## Limites e próxima evolução

- Entrega com repetição possível: se o serviço aceitar e a resposta/gravação se perder, outra tentativa pode ocorrer. Topic/tag reduzem duplicações visuais, mas não garantem entrega exatamente uma vez.
- Sem tráfego, o job verifica a fila a cada cinco minutos. Lotes pendentes podem exigir vários ciclos; não há SLA de entrega instantânea. A capacidade inicial é deliberadamente limitada e deve ser ampliada com consumidor de fila dedicado se o volume crescer.
- O contador de tentativas representa reservas de processamento, inclusive cancelamentos antes da chamada; o limite de cinco chamadas HTTP continua aplicado.
- O recebimento no dispositivo continua sujeito a permissão, sessão válida, serviço de push, rede e políticas do navegador/sistema operacional. Esta etapa não comprova melhora de bateria nem mede latência ponta a ponta.
- O repositório contém o APK compilado, mas não o projeto Android. Foi solicitada sua localização ao usuário. FCM nativo, otimização de processos Android, recompilação e assinatura do APK permanecem pendentes desse código-fonte.
- WebSockets/SSE, conectores externos e dashboards de métricas por API pertencem às próximas entregas; este painel é de diagnóstico periódico da fila push.

## Publicação

- Versão **299**, publicada em **23/09/2026 às 14h09min41s (Brasília)**, na [plataforma Vínkulo](https://adote-gestao.da0602766.chatgpt.site).
- Commit de código: `7c7a0ecd5529bcb8a26e083a7a24eda2e5b59077`, enviado à branch `main` do repositório Sites e confirmado por fetch antes de salvar a versão.
- Versão salva: `appgprj_6a5af9301a888191b2abefddaa299618~appgver_b7fbbe44fec88191a8f516a5875034e4`.
- Implantação: `appgdep_6ab407b1f04081919caedd776398bbb8`, estado `succeeded`.
- SHA-256 do pacote gzip local: `ec7742fe906be5976df25eede82b1244f49caaee641fd127564b150d27c3dd58`. Pacote construído do commit acima, com Worker, assets e migração 0078.
- Produção: início, login e comunidades retornaram HTTP 200; o novo diagnóstico retornou HTTP 401 e `no-store` sem sessão.
- No console autenticado, o painel exibiu **Envio configurado** e **Agendamento ativo**. Consulta às 14h11min28s: última execução agendada às **14h10min00s** e último processamento concluído às **14h10min59s**, todos em Brasília. A fila começou vazia, como esperado sem backfill ou avisos artificiais.
- Painel publicado conferido em 390 px: documento de 375 px, sem transbordamento horizontal. Nenhum erro foi exibido no diagnóstico durante as consultas observadas. O teste não comprova entrega física em um aparelho; nenhuma mensagem foi gerada para essa finalidade.
