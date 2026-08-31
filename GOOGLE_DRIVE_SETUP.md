# Ativação da Conta Google e do Google Drive

Este arquivo descreve apenas a configuração administrativa. Nenhum Client
Secret deve ser salvo no Git ou em arquivos do projeto.

## 1. Preparar o projeto no Google Cloud

1. Abra o Google Cloud Console e selecione ou crie o projeto do Vínkulo.
2. Em **APIs e serviços**, habilite a **Google Drive API**.
3. Configure a tela de consentimento OAuth com o nome e os contatos oficiais do
   Vínkulo.
4. Cadastre os escopos `openid`, `email`, `profile` e
   `https://www.googleapis.com/auth/drive.file`.

O escopo `drive.file` limita o Vínkulo aos arquivos que ele próprio cria ou que
o usuário autoriza, sem conceder acesso geral ao Drive.

## 2. Criar o cliente OAuth

Crie uma credencial **OAuth Client ID** do tipo **Web application** e use:

- Origem JavaScript autorizada:
  `https://adote-gestao.da0602766.chatgpt.site`
- URI de redirecionamento autorizada:
  `https://adote-gestao.da0602766.chatgpt.site/api/auth/google/callback`

Copie o Client ID e o Client Secret. O Client Secret deve ser informado somente
no gerenciador seguro de variáveis do Site.

## 3. Variáveis do ambiente hospedado

- `GOOGLE_CLIENT_ID`: Client ID criado no Google Cloud.
- `GOOGLE_CLIENT_SECRET`: Client Secret, marcado como segredo.
- `GOOGLE_CREDENTIALS_SECRET`: segredo exclusivo usado para criptografar os
  refresh tokens. Ele deve ser marcado como segredo e não deve ser trocado sem
  um plano de reconexão das contas.

## 4. Ordem segura de ativação

1. Configurar as variáveis.
2. Publicar a versão validada.
3. Entrar em **Minha conta → Conteúdo e privacidade**.
4. Conectar a Conta Google e autorizar o Drive separadamente.
5. Criar a pasta comunitária do Drive.
6. Executar a migração. A exclusão do conteúdo antigo só acontece depois da
   cópia e da atualização das referências.
7. Confirmar que o painel informa **Migração concluída**.

## Garantias do fluxo

- Entrar com Google não autoriza o Drive automaticamente.
- Uma Conta Google não cria uma conta Vínkulo nem um vínculo comunitário.
- Novas fotos e arquivos não são gravados no bucket da plataforma.
- Novas mensagens são criptografadas antes de serem salvas no Drive.
- O download automático começa desligado e depende da escolha do usuário.
