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

## 2.1 Publicação, escopos e verificação da marca

A tela de consentimento nasce com o status **Em teste**. Nesse status o Google
responde `Erro 403: access_denied` para qualquer conta que não esteja na lista
de testadores — inclusive a conta proprietária do projeto, porque "proprietário
do projeto" e "testador autorizado" são cadastros separados.

1. Abra **Google Auth Platform → Público-alvo**
   (`https://console.cloud.google.com/auth/audience`).
2. Em **Usuários de teste**, adicione os e-mails que vão entrar (limite de 100).
3. O acesso vale imediatamente, sem verificação do Google.

`drive.file` é um escopo não sensível. Publicação em produção, verificação da
marca e verificação de acesso a dados são etapas distintas. O Google pode exigir
verificação da marca para exibir nome/logo de um app externo em produção, mesmo
sem escopos sensíveis. Confira o estado na Central de verificação.

Em 30/10/2026, capturas fornecidas pelo proprietário confirmaram: Drive API
ativada, aplicativo externo em produção, marca pendente e acesso aos dados sem
verificação exigida para os escopos configurados naquele momento. Isso não
comprova a lista exata de escopos nem a aprovação de fluxos opcionais.

O código também contém um fluxo opcional de Planilhas (`visitorSheets`) que
solicita `spreadsheets` e `drive.metadata.readonly`. Revise esse fluxo e suas
permissões separadamente; não amplie os escopos apenas para verificar a marca.

Para a verificação da marca, confira as páginas públicas e a propriedade do
domínio exigido pelo Console. Cadastrar um domínio não comprova sua propriedade.
Não tente verificar o domínio raiz do provedor sem controle sobre ele:

- Página inicial: `https://<dominio>/`
- Política de Privacidade: `https://<dominio>/privacidade`
- Termos de Serviço: `https://<dominio>/termos`

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
- Mensagens privadas seguem a política específica do chat. A política atual
  (`app/privacidade/page.tsx`) informa armazenamento no banco do Vínkulo e
  exclusão semanal; não prometa armazenamento dessas mensagens no Drive.
- O download automático começa desligado e depende da escolha do usuário.
