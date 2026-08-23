# Vínkulo para Android

Aplicativo Android conectado à plataforma oficial do Vínkulo.

## Permissões

- **Câmera:** solicitada na primeira abertura, logo depois das notificações, para evitar o bloqueio do WebView em alguns aparelhos Samsung.
- **Notificações:** solicitada na primeira abertura em Android 13 ou superior.

Versão atual: **1.3.0** (`versionCode 4`).

## Compartilhamento no WhatsApp

O botão do WhatsApp usa uma ponte nativa protegida pelo domínio oficial do Vínkulo. No aplicativo Android, ele abre diretamente a escolha de conversa ou grupo no WhatsApp (ou WhatsApp Business), sem depender da área de transferência.

## Identidade visual

A identidade mostrada dentro do aplicativo vem da própria plataforma. O ícone da tela inicial do Android faz parte do APK; após uma alteração de ícone, gere uma nova versão do aplicativo.

## Gerar o APK

Abra o projeto no Android Studio e use **Build > Build APK(s)**. Também há um fluxo do GitHub Actions no repositório para gerar `app-debug.apk` automaticamente.

Depois de uma compilação da branch principal, a versão mais recente também fica disponível em `downloads/VINKULO_ANDROID_LATEST.apk` no repositório.

## Endereço conectado

`https://adote-gestao.da0602766.chatgpt.site`
