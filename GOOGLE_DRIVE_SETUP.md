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
  refresh tokens, ler envelopes legados e validar referências assinadas antigas.
  Ele deve ser marcado como segredo e não pode ser removido enquanto esses
  registros ainda existirem.
- `GOOGLE_ENCRYPTION_KEYS`: objeto JSON secreto com as chaves de conteúdo por
  identificador, por exemplo `{ "2026-09": "segredo-aleatorio-longo" }`.
- `GOOGLE_ENCRYPTION_KEY_ID`: identificador da chave usada para novos conteúdos,
  por exemplo `2026-09`. O identificador precisa existir em
  `GOOGLE_ENCRYPTION_KEYS`.

## 4. Ordem segura de ativação

1. Configurar as variáveis.
2. Publicar a versão validada.
3. Entrar em **Minha conta → Conteúdo e privacidade**.
4. Conectar a Conta Google e autorizar o Drive separadamente.
5. Criar a pasta comunitária do Drive.
6. Fazer backup/exportação do D1 e inventário do bucket legado.
7. Aplicar a migração aditiva `0068_security_storage.sql`.
8. Executar a migração de conteúdo em lotes. Cada cópia é relida e validada por
   tamanho e SHA-256 antes da troca da referência.
9. Reconciliar a quantidade de originais e destinos e testar as permissões.
   A rotina não apaga originais legados. Qualquer limpeza posterior exige uma
   operação separada, manifestada e aprovada.
10. Confirmar que o painel informa **Migração concluída**.

## Rotação sem perder o histórico

1. Gere uma nova chave aleatória e acrescente-a ao JSON existente; não substitua
   nem reutilize o valor de uma chave anterior.
2. Altere apenas `GOOGLE_ENCRYPTION_KEY_ID` para o novo identificador e publique
   uma versão validada. Novos envelopes passam a registrar esse identificador.
3. Verifique a leitura de mensagens novas, envelopes antigos e cópias de
   recuperação. Se necessário, reprocesse os antigos gradualmente para a chave
   ativa.
4. Remova uma chave antiga somente depois de um inventário comprovar zero
   referências a seu identificador e os backups terem sido testados.

`GOOGLE_CREDENTIALS_SECRET` continua necessário para refresh tokens, envelopes
versão 1 e URLs legadas. Sua rotação exige recriptografar esses registros e
migrar as referências antigas; removê-lo antes disso torna o histórico ilegível.

## Garantias do fluxo

- Entrar com Google não autoriza o Drive automaticamente.
- Uma Conta Google não cria uma conta Vínkulo nem um vínculo comunitário.
- Novas fotos e arquivos não são gravados no bucket da plataforma.
- Novas mensagens são criptografadas antes de serem salvas no Drive.
- Essa criptografia é aplicada pelo servidor; não é criptografia de ponta a
  ponta, pois o serviço mantém as chaves necessárias à leitura autorizada.
- O download automático começa desligado e depende da escolha do usuário.
- A URL de um arquivo não concede acesso. Cada leitura revalida a sessão, o
  vínculo, a comunidade, o recurso associado e o estado público/privado.
