# Vínkulo para Android

Aplicativo Android conectado à plataforma oficial do Vínkulo.

Versão estável de distribuição geral: **1.7.1** (`versionCode 10`). Candidato para homologação: **1.9.0** (`versionCode 12`).

## Consultas offline — candidato 1.9.0

Entrada local com ativação explícita de mural, agenda (eventos e compromissos próprios) e designações próprias em escalas publicadas. Os workspaces completos continuam online. APK 1.8.0 introduziu a fundação; esta versão acrescenta somente leitura, não rascunhos/outbox.

- Backend `/api/mobile/snapshot`, protocolo 2; o bootstrap de protocolo 1 permanece disponível para APKs anteriores.
- Transporte HTTPS nativo com sessão/origem/desafio, sem instalar concessões recebidas de JavaScript. Snapshot autenticado, não um token de API.
- Uma cópia substituída atomicamente, cifrada com AES-GCM/Android Keystore no Room/schema 2; limite 1 MiB, validade até 8h ou expiração da sessão. Cookies não são enviados à ponte JavaScript.
- Troca de sessão/comunidade, reboot, relógio alterado, bloqueio e 401/403 impedem leitura. Sem rede, revogação remota só é limitada pelo vencimento da cópia.
- Máximos: 50 publicações, 100 eventos, 100 compromissos e 100 designações; agenda/escalas de agora menos 24h aos próximos 30 dias. Sem mídias, diretório de pessoas, lista de inscritos, tokens de compartilhamento ou chat.
- Atualizar manualmente na entrada local, ou ao abrir o painel após consentimento no mesmo vínculo. Sem sincronização operacional em segundo plano. Desativar remove a cópia consultável, mas não encerra a sessão online.
- Testes de homologação: testes Java/JS, armazenamento cifrado, migração, limites, expiração, troca de vínculo, leitura local/recriação e cadeia de atualização assinada 1.7.1 → 1.8.0 → 1.9.0 em emuladores API 29/35. WebView antigo sem ponte segura só oferece atualização do WebView e sistema online.

Distribuição geral depende de testes físicos autenticados e integrações, desempenho medido, Gradle Wrapper/checksum, dependências verificadas/travadas e actions fixadas por SHA. Não prometer funcionamento majoritariamente offline nem build bit a bit reproduzível nesta etapa.

## Melhorias da versão 1.7.0

- Ponte `WebMessageListener` restrita à origem oficial e ao frame principal. O adaptador JavaScript mantém os métodos usados pela plataforma, sem `addJavascriptInterface`.
- Remove o timer nativo duplicado de 20 segundos; a plataforma mantém uma consulta em primeiro plano e recebe um evento ao retomar o aplicativo. Timers e WebView são pausados quando o app sai de uso.
- Downloads do site pelo DownloadManager, preservando a sessão em relatórios autenticados. Em Android 10+, os arquivos vão para Downloads; em versões anteriores, para a pasta de downloads do aplicativo, acessível pela notificação do download.
- Área segura considera teclado, barras do sistema e recorte da câmera. Restauração de tela com fallback e seletor de arquivos com tratamento de indisponibilidade.
- Notificações nativas com texto genérico, visibilidade privada e sem repetir som para a mesma tag.
- R8 e redução de recursos ativados; build inclui testes da política de origem/links, lint e comparação do certificado com o APK 1.5.1.

Os recursos da ponte exigem Android System WebView com `WEB_MESSAGE_LISTENER` e `DOCUMENT_START_SCRIPT`. Se não estiverem disponíveis, o app orienta atualizar o WebView e mantém a navegação web, sem reinstalar uma ponte insegura.

O FCM usa mensagens de dados vinculadas à sessão. O arquivo `google-services.json` fica fora do repositório e é fornecido pelo segredo `VINKULO_GOOGLE_SERVICES_JSON`. O token é registrado pela página oficial autenticada; troca de token/conta e logout invalidam o vínculo local. O servidor revalida sessão, usuário e aviso antes do envio. O serviço exibe somente texto genérico e ignora mensagens de vínculos antigos. O envio depende da credencial cadastrada em Proprietário → Integrações → Firebase. É necessário instalar, abrir, entrar na conta e permitir notificações; encerramento forçado e restrições do Android podem impedir a entrega. Homologação em aparelho real ainda necessária.

O backend deve usar apenas mensagens FCM `data` com `bindingId`, `notificationId` e rota interna. Mensagens `notification` enviadas pelo Console Firebase podem ser exibidas automaticamente pelo SDK sem passar pela validação de vínculo; não use campanhas do console para conteúdo de usuários. Use o teste autenticado da plataforma.

## Login e Google Drive

O Google abre em uma aba segura sobre o aplicativo, como exigido pelo provedor. Ao concluir ou cancelar, o endereço `vinkulo://google-login-complete` devolve o usuário automaticamente ao app e a WebView finaliza o login ou a conexão do Drive.

## Permissões

- **Câmera:** solicitada quando o recurso da página oficial precisar dela, sem pedido automático na abertura.
- **Microfone:** concedido apenas quando um recurso da página solicitar áudio.
- **Notificações:** solicitada na primeira abertura em Android 13 ou superior.

## Compartilhamento no WhatsApp

O botão do WhatsApp usa uma ponte nativa protegida pelo domínio oficial do Vínkulo. No aplicativo Android, ele abre diretamente a escolha de conversa ou grupo no WhatsApp ou WhatsApp Business.

## Gerar o APK de produção

O aplicativo de produção usa uma chave PKCS#12 estável com alias `vinkulo-release`.
O GitHub Actions recebe a chave exclusivamente pelos segredos
`ANDROID_SIGNING_KEYSTORE_BASE64` e `ANDROID_SIGNING_PASSWORD`, executa
`assembleRelease` e entrega `app-release.apk`. A chave, a senha e seus backups
nunca devem ser adicionados ao repositório.

Para o FCM, cadastre também o segredo `VINKULO_GOOGLE_SERVICES_JSON` com o conteúdo integral do arquivo baixado no Firebase Console. Ele deve corresponder ao pacote `com.vinkulo.app` do projeto `vinkulo-256e8`.

A versão 1.3.0 pública usava um certificado de depuração. Por isso, a primeira
instalação da versão 1.5.0 de produção exige remover a versão anterior uma única
vez. Depois dessa troca, as próximas versões assinadas pela mesma chave poderão
ser instaladas como atualização normal.

## Endereço conectado

`https://adote-gestao.da0602766.chatgpt.site`
