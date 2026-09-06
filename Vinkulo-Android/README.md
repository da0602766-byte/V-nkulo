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

## Gerar o APK de produção

O aplicativo de produção usa uma chave PKCS#12 estável com alias `vinkulo-release`.
O GitHub Actions recebe a chave exclusivamente pelos segredos
`ANDROID_SIGNING_KEYSTORE_BASE64` e `ANDROID_SIGNING_PASSWORD`, executa
`assembleRelease` e entrega `app-release.apk`. A chave, a senha e seus backups
nunca devem ser adicionados ao repositório.

A versão 1.3.0 pública usava um certificado de depuração. Por isso, a primeira
instalação da versão 1.5.0 de produção exige remover a versão anterior uma única
vez. Depois dessa troca, as próximas versões assinadas pela mesma chave poderão
ser instaladas como atualização normal.

## Endereço conectado

`https://adote-gestao.da0602766.chatgpt.site`
