# Preparação para verificação OAuth do Google — VÍNKULO

Este documento reúne o que já está pronto no código e o que só pode ser
feito manualmente no Google Cloud Console. Nada aqui foi inventado — onde
um dado real é necessário (endereço, CNPJ, e-mail de suporte), está
marcado como `[a definir]`.

## 1. Nome do aplicativo

**VÍNKULO** — gestão para igrejas e comunidades.

## 2. Domínio utilizado

`vinkulo.da0602766.chatgpt.site` é a origem publicada. O domínio anterior
redireciona para ela. O início do OAuth solicita o callback na origem atual.
Confira a URI exata na credencial Web do Google Cloud Console.

Se houver um domínio próprio (`vinkulo.com`, `vinkulo.app` ou similar)
planejado além deste, ele precisa ser adicionado nas mesmas telas do
Console listadas abaixo — o código já usa `url.origin` dinamicamente para
montar o `redirect_uri`, então não exige alteração de código, só cadastro
no Console.

## 3. URLs necessárias

| URL | Uso |
| --- | --- |
| `https://vinkulo.da0602766.chatgpt.site` | Homepage / Origem JavaScript autorizada |
| `https://vinkulo.da0602766.chatgpt.site/privacidade` | Política de Privacidade |
| `https://vinkulo.da0602766.chatgpt.site/termos` | Termos de Uso |
| `https://vinkulo.da0602766.chatgpt.site/exclusao-de-dados` | Instruções de exclusão de conta e dados |
| `https://vinkulo.da0602766.chatgpt.site/contato` | Contato/suporte |
| `https://vinkulo.da0602766.chatgpt.site/api/auth/google/callback` | Redirect URI (login e Drive usam o mesmo endpoint) |

## 4. Homepage

`https://vinkulo.da0602766.chatgpt.site/` — página pública, sem
login, com apresentação da plataforma e links de rodapé para Privacidade,
Termos, Exclusão de dados e Contato.

## 5. Política de Privacidade

`https://vinkulo.da0602766.chatgpt.site/privacidade` — já existe e
foi atualizada nesta rodada com: separação login vs. Drive, menção
explícita aos escopos usados, referência à Google API Services User Data
Policy, e link para a página de exclusão de dados.

## 6. Termos de Uso

`https://vinkulo.da0602766.chatgpt.site/termos` — já existe, agora
com uma seção curta referenciando Conta Google/Drive e a página de
exclusão.

## 7. Redirect URIs

Cadastrar no Google Cloud Console, em **APIs e serviços → Credenciais →
[seu OAuth Client] → URIs de redirecionamento autorizados**:

```
https://vinkulo.da0602766.chatgpt.site/api/auth/google/callback
```

Para desenvolvimento local (opcional, só se for testar OAuth localmente):

```
http://localhost:5188/api/auth/google/callback
```

O código monta a URI com a origem da requisição e o caminho fixo
`/api/auth/google/callback`. O Google exige que a URI transmitida corresponda
à configuração do cliente OAuth Web.

## 8. Scopes solicitados

| Escopo | Quando é pedido | Classificação Google |
| --- | --- | --- |
| `openid` | Sempre (login) | Não sensível |
| `email` | Sempre (login) | Não sensível |
| `profile` | Sempre (login) | Não sensível |
| `https://www.googleapis.com/auth/drive.file` | Quando o usuário autoriza o Google Drive | Não sensível |

O fluxo opcional de Planilhas também solicita `spreadsheets` e
`drive.metadata.readonly`. Revise esses escopos no Console se usar esse fluxo.

## 9. Justificativa de cada escopo

- **`openid` / `email` / `profile`** — identificar quem está entrando
  (nome, e-mail, foto) para criar ou reconhecer a conta no VÍNKULO. Sem
  eles não há como saber quem é o usuário.
- **`drive.file`** — permitir que o usuário guarde, no próprio Google
  Drive dele, os arquivos que cria dentro do VÍNKULO (fotos de perfil,
  anexos de conversa, mídia de publicação), em vez do VÍNKULO guardar uma
  cópia própria. O escopo é limitado aos arquivos que o próprio app cria
  ou que o usuário abre explicitamente pelo seletor do Google — nunca ao
  Drive inteiro. Por isso não usamos `drive` (acesso total), que exigiria
  uma auditoria de segurança (CASA) do Google antes da verificação.

## 10. APIs Google necessárias

- **Google Drive API** — para criar pastas, enviar, ler e apagar os
  arquivos que o próprio VÍNKULO gerencia dentro do Drive do usuário.
- Nenhuma outra API Google é usada. A validação de identidade do login usa
  o endpoint público `oauth2.googleapis.com/tokeninfo`, que não exige
  habilitação separada.

## 11. Configurações necessárias no Google Auth Platform

No Console (`Google Auth Platform` — antigo "Tela de consentimento
OAuth"):

1. **Tipo de usuário**: Externo (qualquer Conta Google pode entrar).
2. **Nome do app**: VÍNKULO.
3. **Logo**: usar o ícone já publicado em `/vinkulo-app-icon-192.png`.
4. **E-mail de suporte ao usuário**: `[a definir]`.
5. **E-mail de contato do desenvolvedor**: `[a definir]`.
6. **Domínios autorizados**: confira o domínio exigido pelo Console para
   as URLs públicas e comprove propriedade onde a conta tiver controle.

## 12. Configurações em Branding

- Nome do app, logo e e-mails de suporte (itens 2-5 acima).
- Link da Política de Privacidade: `/privacidade`.
- Link dos Termos de Serviço: `/termos`.

## 13. Audience

- Definir como **Externo** (não é G Suite interno).
- Ao publicar, o Google pode pedir a lista de domínios do app — usar o
  mesmo domínio do item 2.
- Enquanto estiver em **Testing**, adicionar manualmente os e-mails que
  podem testar o login em **Audience → Test users** (isso explica por que
  o login já funciona para você mesmo sem o app estar em produção — você
  provavelmente está na lista de test users, ou o app já foi publicado).

## 14. Data Access

- Conferir os escopos da seção 8 e revisar separadamente os do fluxo opcional
  de Planilhas.
- Confirmar a resposta às perguntas de uso de dados do Drive: os dados são
  usados **somente dentro do próprio app**, não são vendidos, não
  alimentam publicidade, e não são usados para treinar modelos de IA
  generalistas.

## 15. Clients

- Um único **OAuth Client ID** do tipo **Web application**, com a origem
  JavaScript e o redirect URI da seção 3/7.
- Não é necessário criar um client separado para Android: o app usa o
  navegador do sistema (fluxo web) e retorna por `intent://`, então não
  existe OAuth Client "Android" nem `google-services.json` no projeto.

## 16. Processo para mudar de Testing para Production

1. Confirmar que Política de Privacidade, Termos, Homepage e as páginas
   de exclusão/contato estão publicadas e acessíveis sem login (itens 3-6
   já cobrem isso).
2. Preencher Branding, Audience e Data Access (itens 12-14).
3. Se solicitado, comprovar no [Google Search Console](https://search.google.com/search-console)
   a propriedade do domínio exigido. Se a verificação depender do domínio do
   provedor, registre essa dependência antes de prosseguir.
4. No Google Auth Platform, clicar em **Publish App** (ou "Publicar
   aplicativo"). Confira na Central de verificação o status da marca e os
   requisitos de acesso aos dados conforme os escopos solicitados.
5. Se o Google pedir o vídeo de demonstração, use o roteiro em
   `docs/guias/GOOGLE_OAUTH_VIDEO_VERIFICACAO.md`.

## 17. O que ainda precisa de ação manual (só você pode fazer)

- [x] E-mail de contato preenchido (`da0602766@gmail.com`), centralizado em
      `app/lib/contact-emails.ts` — as páginas `/contato` e
      `/exclusao-de-dados` leem essa lista automaticamente. Para adicionar
      mais e-mails no futuro, basta incluir a string nesse arquivo; não
      precisa editar as páginas.
- [ ] Preencher `[Razão social / responsável legal a definir]` e endereço
      em `app/contato/page.tsx`, se o Google exigir na verificação.
- [ ] Definir e preencher o prazo de exclusão em
      `app/exclusao-de-dados/page.tsx` (item 4 da página).
- [ ] Confirmar no Google Cloud Console que `GOOGLE_CLIENT_ID`,
      `GOOGLE_CLIENT_SECRET` e `GOOGLE_CREDENTIALS_SECRET` (esses são os
      nomes reais usados no código — não `GOOGLE_REDIRECT_URI` nem
      `GOOGLE_CREDENTIALS`, que não existem no projeto) estão configurados
      como segredo no gerenciador de variáveis do site de produção.
- [ ] Confirmar se `GOOGLE_CREDENTIALS_SECRET` está definida separada de
      `AUTH_SECRET` em produção — hoje o código usa `AUTH_SECRET` como
      reserva se `GOOGLE_CREDENTIALS_SECRET` não existir
      (`app/lib/google-integration.ts`, função `credentialSecret`). Isso
      funciona, mas definir as duas separadamente é mais limpo. **Não mudei
      isso no código** porque trocar a chave de criptografia sem migração
      tornaria ilegíveis os refresh tokens já salvos de quem já conectou o
      Drive.
- [ ] Verificar a propriedade do domínio no Google Search Console (item 16.3).
- [ ] Confirmar se o app já está em Testing ou Production hoje — você não
      soube informar, e eu não tenho acesso ao Console para checar. O
      login funcionar não decide isso sozinho: tanto Testing (com seu
      e-mail na lista de test users) quanto Production explicam o que você
      viu.
- [ ] Localizar (ou decidir que ainda não existe) o código-fonte do app
      Android, para eu confirmar que o `AndroidManifest.xml` registra
      `scheme=vinkulo` e `package=com.vinkulo.app`, usados em
      `app/components/GoogleAppReturn.tsx`. A pasta `Vinkulo-Android/` no
      projeto só tem cache de build (`.gradle`, `build/`), sem manifesto.

## 18. Checklist antes de solicitar verificação

- [x] Login e conexão do Drive são ações separadas no fluxo (código já fazia isso).
- [x] Escopo mínimo usado (`drive.file`, não `drive`).
- [x] Client Secret nunca sai do servidor.
- [x] Refresh token criptografado no banco.
- [x] `state` assinado (CSRF) e cookie `__Host-` seguro.
- [x] Redirect URI só aceita HTTPS em produção (corrigido nesta rodada).
- [x] Nenhum segredo versionado no Git (histórico completo verificado).
- [x] Política de Privacidade e Termos existem e mencionam Google/Drive.
- [x] Página de exclusão de conta/dados existe.
- [x] Página de contato/suporte existe.
- [ ] E-mails reais de suporte/privacidade preenchidos (placeholders hoje).
- [ ] Branding, Audience, Data Access e Clients configurados no Console.
- [ ] Propriedade do domínio verificada no Search Console.
- [ ] App publicado (Testing → Production) no Console.

Com os `[a definir]` preenchidos e os itens do Console configurados, o
VÍNKULO está tecnicamente pronto para solicitar a publicação/verificação.
