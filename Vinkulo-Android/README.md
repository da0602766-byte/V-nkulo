# Vínkulo para Android

Aplicativo Android conectado à plataforma oficial do Vínkulo.

Versão atual: **1.5.0** (`versionCode 6`).

## Login e Google Drive

O Google abre em uma aba segura sobre o aplicativo, como exigido pelo provedor. Ao concluir ou cancelar, o endereço `vinkulo://google-login-complete` devolve o usuário automaticamente ao app e a WebView finaliza o login ou a conexão do Drive.

## Permissões

- **Câmera:** solicitada na primeira abertura para leitura de QR Code e envio de imagens.
- **Microfone:** concedido apenas quando um recurso da página solicitar áudio.
- **Notificações:** solicitada na primeira abertura em Android 13 ou superior.

## Compartilhamento no WhatsApp

O botão do WhatsApp usa uma ponte nativa protegida pelo domínio oficial do Vínkulo. No aplicativo Android, ele abre diretamente a escolha de conversa ou grupo no WhatsApp ou WhatsApp Business.

## Gerar o APK

Abra o projeto no Android Studio e use **Build > Build APK(s)**. O fluxo do GitHub Actions também gera `app-debug.apk` para validação em cada pull request que altera o aplicativo.

## Endereço conectado

`https://adote-gestao.da0602766.chatgpt.site`
