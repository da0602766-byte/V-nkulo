# Etapa P3 — central de integrações e APK 1.6.0

## Entrega

Nova área Integrações no console do proprietário, com catálogo fechado de adaptadores no servidor. O primeiro conector operacional é o Supabase: reutiliza configuração, teste, sincronização e remoção existentes, sem duplicar credenciais. WhatsApp Business, Booking.com e Airbnb aparecem como não implementados, sem botões que simulem autorização.

O catálogo consulta o D1 sem chamar provedores externos. Os estados usam teste recente, sincronização posterior à configuração e confirmação recente do agendamento. Erros são isolados por conector, com mensagens sem segredos. A rota exige proprietário ativo e responde com cache desabilitado. Salvar credenciais invalida o teste anterior; requisições ao Supabase não seguem redirecionamentos com credenciais.

## APK de produção

- Versão 1.6.0, versionCode 8, pacote `com.vinkulo.app`.
- Download: `/downloads/VINKULO_ANDROID_1.6.0.apk`.
- Tamanho: 69.037 bytes; anterior 1.5.1: 944.140 bytes. Redução do arquivo de aproximadamente 92,7%, com R8 e remoção de recursos não utilizados. Não representa medição de memória ou bateria.
- SHA-256 do APK: `b78114e4c92fc2ee993847ad8981ea2ede6d68ed67c7bb6965b281a8935ea77e`.
- Certificado SHA-256: `2eddeaea4f33a6984deb195086e852d8f03fabdb7e67096a03209c8dd651ae1c`, comparado automaticamente com a versão 1.5.1. Mesma assinatura, sem chave de depuração.
- Fonte: branch `feat/android-1.6-secure-lifecycle`, commit `d595b7a0f6a159ca0daab3953f6232962b8665a0`, [PR 15](https://github.com/da0602766-byte/V-nkulo/pull/15).
- [Build verificado](https://github.com/da0602766-byte/V-nkulo/actions/runs/35900141792): `testDebugUnitTest`, `lintRelease`, `assembleRelease`, verificação da assinatura e comparação do certificado aprovados. Artefato 10768638978; ZIP conferido por SHA-256 antes da extração.

### Alterações nativas

- Ponte JavaScript restrita à origem HTTPS oficial, frame principal e tamanho máximo, com AndroidX WebKit. Removida a interface legada exposta a frames. Recursos são verificados antes de usar; WebViews antigos recebem orientação de atualização.
- Pausa e retomada do WebView conforme o ciclo de vida; remoção do temporizador nativo adicional de 20 segundos, preservando a atualização da camada web em primeiro plano.
- Câmera e microfone solicitados quando utilizados pela origem autorizada; teclado considerado nos insets; reprodução de mídia exige gesto do usuário.
- Downloads autenticados pela origem oficial, nome de arquivo sanitizado e DownloadManager. Intents externos limitados e sanitizados.
- Notificações nativas com texto genérico, sem conteúdo privado na tela bloqueada; links limitados às rotas reconhecidas.

## Validação e limites

- Plataforma: TypeScript e build aprovados, 462 testes aprovados. Validação completa sem erros de lint; o primeiro lint contou também a cópia de código do worktree Android (84 avisos). Conferência da árvore principal separadamente, ignorando `.task-tools`: 0 erros e 43 avisos preexistentes.
- Android: 4 testes unitários passaram; lint com 0 erros e 12 avisos (incluindo target SDK 35, atualizações disponíveis e avisos de detecção das verificações de recursos). As duas APIs WebKit têm verificações explícitas em tempo de execução.
- Central conferida em 320, 390 e 1440 pixels, temas claro e escuro, sem transbordamento horizontal nas medidas realizadas. Novos botões com altura de 44 pixels; foco encaminhado ao abrir a configuração.
- Sem teste em aparelho físico ou emulador nesta entrega. Atualização instalada, retorno do Google, câmera, microfone, downloads e retomada devem ser homologados em aparelhos representativos; não se declara redução medida de bateria ou latência.
- FCM nativo **não implementado**: depende de projeto Firebase e configuração do envio. O APK continua recebendo avisos em primeiro plano. A instalação pelo navegador mantém a alternativa de Web Push, conforme suporte e permissão do navegador. A interface de download informa essa diferença.
- Nenhuma migração ou alteração de configuração de produção necessária. Não foram ativados provedores externos nem alteradas credenciais existentes.

## Referências técnicas

- [Segurança de pontes Android](https://developer.android.com/develop/ui/views/layout/webapps/native-api-access-jsbridge).
- [WebViewCompat](https://developer.android.com/reference/androidx/webkit/WebViewCompat).
- [Recebimento FCM](https://firebase.google.com/docs/cloud-messaging/android/receive-messages).

## Publicação

Publicado como versão **300** em https://adote-gestao.da0602766.chatgpt.site, commit de código `8e0249cbcaa6555a94831b071b46314bd40a42ea`, deployment `appgdep_6ab418dc6ad48191b7a9e9d6f3bc505a`, concluído em 23/09/2026 às 15h22 (Brasília). Download HTTP 200, 69.037 bytes e SHA-256 idêntico ao artefato assinado; início, login e comunidades HTTP 200; catálogo sem sessão HTTP 401. Audiência pública preservada. PR Android 15 permanece em rascunho; não foi mesclada.

Conferência autenticada em produção às 15h24: central carregada, Supabase conectado, sincronização às 15h20m01s e agendamento às 15h20m00s, sem modificar configuração.
