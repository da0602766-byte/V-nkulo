# Documentação

Índice da documentação do projeto, organizada por assunto. O código-fonte
continua em `app/`, `worker/`, `db/`, `drizzle/`, `scripts/`, etc. — nada
disso foi tocado por esta organização.

## `coordenacao/`

Estado vivo do projeto e o fluxo de publicação usado pelos agentes de IA
(Claude/Codex) que trabalham neste repositório. Comece por aqui se for
publicar algo ou entender o que já foi feito.

- [`COORDENACAO_IA.md`](coordenacao/COORDENACAO_IA.md) — histórico de quem
  publicou o quê, quando e como.
- [`ESTADO_DO_PROJETO.md`](coordenacao/ESTADO_DO_PROJETO.md) — estado
  técnico e limitações atuais.
- [`APK_OFFLINE_ARQUITETURA.md`](coordenacao/APK_OFFLINE_ARQUITETURA.md) — arquitetura proposta, matriz de módulos e critérios das etapas do APK offline.
- [`REFORMA_VISUAL_V5.md`](coordenacao/REFORMA_VISUAL_V5.md) — especificação
  em andamento da reforma de UI/UX.

## `prompts/`

Prompts de handoff para publicação — cada um documenta uma entrega pronta
para ser integrada e publicada.

- [`PROMPT_PUBLICACAO_AVISOS_GOOGLE.md`](prompts/PROMPT_PUBLICACAO_AVISOS_GOOGLE.md)
- [`PROMPT_PUBLICACAO_CODEX.md`](prompts/PROMPT_PUBLICACAO_CODEX.md)
- [`PROMPT_PUBLICACAO_GOOGLE_OAUTH.md`](prompts/PROMPT_PUBLICACAO_GOOGLE_OAUTH.md)
- [`PROMPT_PUBLICACAO_OTIMIZACAO_DESEMPENHO.md`](prompts/PROMPT_PUBLICACAO_OTIMIZACAO_DESEMPENHO.md)
- [`PROMPT_PUBLICACAO_RECEPCAO_AVISOS_BIBLIOTECA.md`](prompts/PROMPT_PUBLICACAO_RECEPCAO_AVISOS_BIBLIOTECA.md)
- [`PROMPT_PUBLICACAO_RELACIONAMENTO_AGENDA.md`](prompts/PROMPT_PUBLICACAO_RELACIONAMENTO_AGENDA.md)
- [`PROMPT_PUBLICACAO_APARENCIA_SEGURANCA.md`](prompts/PROMPT_PUBLICACAO_APARENCIA_SEGURANCA.md)

## `guias/`

Guias de configuração e verificação, principalmente de integração Google.

- [`GOOGLE_DRIVE_SETUP.md`](guias/GOOGLE_DRIVE_SETUP.md)
- [`GOOGLE_OAUTH_VERIFICACAO.md`](guias/GOOGLE_OAUTH_VERIFICACAO.md)
- [`GOOGLE_OAUTH_VIDEO_VERIFICACAO.md`](guias/GOOGLE_OAUTH_VIDEO_VERIFICACAO.md)
- [`GUIA_PASSO_A_PASSO.md`](guias/GUIA_PASSO_A_PASSO.md)

## `documentacao/`

Documentação funcional de módulos específicos.

- [`DOCUMENTACAO_PRESENCA_COMUNITARIA_V4.7.2.md`](documentacao/DOCUMENTACAO_PRESENCA_COMUNITARIA_V4.7.2.md)
- [`DOCUMENTACAO_SECRETARIA_MINISTERIAL_V4.7.2.md`](documentacao/DOCUMENTACAO_SECRETARIA_MINISTERIAL_V4.7.2.md)

## `relatorios/`

Relatórios fechados de entregas já publicadas — histórico, não fluxo ativo.

- [`APK_ETAPA_1_2026-09-27.md`](relatorios/APK_ETAPA_1_2026-09-27.md) — diagnóstico sem deploy: origem/assinatura do APK, baseline disponível e limites da homologação Android.
- [`APK_ETAPA_2_2026-09-27.md`](relatorios/APK_ETAPA_2_2026-09-27.md) — entrada local, contexto cifrado e validação do candidato Android 1.8.0 de homologação.
- [`APK_ETAPA_3_2026-09-27.md`](relatorios/APK_ETAPA_3_2026-09-27.md) — consultas offline autorizadas de mural, agenda e escalas próprias; candidato 1.9.0 de homologação.

- [`RELATORIO_IMPLEMENTACAO_MENU_VISITANTES_COMPARTILHAMENTO.md`](relatorios/RELATORIO_IMPLEMENTACAO_MENU_VISITANTES_COMPARTILHAMENTO.md)
- [`RELATORIO_IMPLEMENTACAO_VINKULO_2026-08-08.md`](relatorios/RELATORIO_IMPLEMENTACAO_VINKULO_2026-08-08.md)
- [`RELATORIO_OTIMIZACAO_GLOBAL_SEGURA_2026-08-13.md`](relatorios/RELATORIO_OTIMIZACAO_GLOBAL_SEGURA_2026-08-13.md)
- [`RELATORIO_VISITANTES_V118_2026-08-13.md`](relatorios/RELATORIO_VISITANTES_V118_2026-08-13.md)

## Fora de `docs/`

- `README.md` (raiz) — continua na raiz por convenção (é o que o GitHub
  mostra na página do repositório).
- `drizzle/README.md` — convenção de migrações, fica junto do código que
  descreve.

## Nota sobre esta reorganização (08/09/2026)

Estes arquivos viviam soltos na raiz do repositório e se referenciavam entre
si por nome de arquivo fixo (sem caminho). Todas essas referências cruzadas
— nos próprios arquivos acima, em `README.md` e em `drizzle/README.md` —
foram atualizadas para o novo caminho relativo à raiz do repo (ex.:
`docs/coordenacao/COORDENACAO_IA.md`). Se você (humano ou agente de IA) for
adicionar um novo documento que referencia outro por nome, use o caminho
completo a partir da raiz para evitar que isso quebre de novo numa próxima
organização.
