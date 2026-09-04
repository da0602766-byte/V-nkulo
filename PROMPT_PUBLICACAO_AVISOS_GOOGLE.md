# Prompt de publicação — para o Codex

Copie daqui para baixo.

---

Você vai publicar a **correção do login com Google, da gravação do Drive e do
cadastro**, junto com os avisos animados das ações com o Google. Está pronta e
validada no branch `claude/google-drive-nao-funciona-yybl7q` do repositório
`da0602766-byte/V-nkulo`, com pull request aberto em
`https://github.com/da0602766-byte/V-nkulo/pull/5`.

## Antes de tudo: não há migração

**Nenhum arquivo em `drizzle/` foi tocado.** Nada a aplicar no D1 antes de
subir o código — a publicação é só do código. As tabelas que a correção usa
(`google_connections`, `storage_preferences`, `user_drive_storage`) já existem
desde a `0060_google_drive_privacy.sql`, que já está em produção.

## O que publicar

Tudo o que o branch tem à frente de `main`. Ele está **0 commits atrás**, sem
conflito. A contagem muda a cada ajuste neste documento, então confira na fonte
em vez de confiar num número aqui:

```
git log --oneline --reverse origin/main..origin/claude/google-drive-nao-funciona-yybl7q
git diff --shortstat origin/main...origin/claude/google-drive-nao-funciona-yybl7q
```

| # | Commit | O que entrega |
| --- | --- | --- |
| 1 | `da41aff` | Sessão sobrevive ao retorno do OAuth; conflito de `google_sub`; comprovação do Drive na tela de conta; sessão no cadastro |
| 2 | `ec7d41d` | Avisos animados de todas as ações com o Google |
| 3+ | `e86a168` e seguintes | Este documento, o registro na coordenação e o script de pré-publicação |

## O defeito e por que ele existia

O cookie de sessão usava `SameSite=Strict`. O retorno do Google
(`accounts.google.com` → `/api/auth/google/callback` → `/painel`) é uma cadeia
de navegação **iniciada por outro site**, e o navegador não envia cookies
`Strict` nessa cadeia. Isso produzia dois sintomas que pareciam separados:

- **No login**, `/painel` não recebia o cookie e devolvia o usuário para
  `/login?motivo=cookie_ausente`. Só um recarregamento manual — navegação
  same-site — entregava o cookie. Era isso que o proprietário descrevia como
  "preciso recarregar a página pra entrar".
- **Ao conectar o Drive**, o callback chama `getSessionUser()` na requisição
  vinda do Google. Sem o cookie, a sessão vinha nula e a rota lançava *"Sua
  sessão mudou durante a autorização"* **antes** de `saveGoogleConnection()`.
  A autorização acontecia de verdade no Google, mas nada era gravado em
  `google_connections` — por isso não havia nenhuma comprovação na plataforma.

A troca para `SameSite=Lax` **não enfraquece a proteção contra CSRF**, e isso
importa para a sua revisão: ela nunca dependeu do `SameSite`. O
`validateApiRequest` em `worker/index.ts` já barra `sec-fetch-site:
cross-site` e `Origin` divergente em todos os métodos não seguros de `/api/`.
`Lax` só libera o cookie em navegação GET de topo, que é exatamente o caso do
retorno do OAuth. O teste `release-security.test.mjs` foi atualizado para
afirmar `Lax` e para exigir que essa defesa do worker continue existindo.

## O que mais entrou

- **Conta Google já vinculada a outro cadastro.** `google_sub` tem índice
  único, mas o `ON CONFLICT` de `saveGoogleConnection` só cobria `usuario_id`.
  O `INSERT` estourava a restrição e devolvia o erro cru do SQLite na tela.
  Agora a checagem é explícita, com mensagem legível.
- **Comprovação do Drive.** `/api/storage/preferences` já devolvia `scopes` e
  `connectedAt`, mas a interface ignorava. A tela de conta passa a exibir conta
  autorizada, data e permissões concedidas em linguagem do usuário.
- **Cadastro abre sessão.** A conta era criada e o usuário voltava ao
  formulário de login, sem sinal de que ela existia. Agora entra logado em
  `/sem-comunidade`.
- **Avisos animados** em todas as ações com o Google: login, cadastro e Drive.

## Uma decisão do proprietário que foi respeitada

O proprietário relatou "cadastros não estão criando acesso para o usuário" e,
ao ser perguntado, **confirmou que o vínculo comunitário deve continuar
dependendo de aprovação**. Então a conta segue nascendo com perfil `LEITURA`,
`permissoes` vazio e `membershipCreated: false` — como já era o comportamento
intencional afirmado nos seus testes. O que mudou foi só abrir a sessão; nada
no modelo de acesso.

## Sobre a sua reserva no COORDENACAO_IA.md

A sua tarefa de 31/08 reservava `app/components/LoginPortal.tsx`,
`app/api/auth/google/start/route.ts` e `app/api/auth/google/callback/route.ts`,
mas está registrada como **concluída, validada e publicada** (versão 198,
`9c3f6a9`). A reserva foi tratada como liberada. O `start` e o `callback` não
foram alterados por esta entrega — só o `LoginPortal.tsx`, que recebeu o aviso
animado no lugar do parágrafo estático de resultado que você havia adicionado.
A capacidade que você entregou ali ("Login e Conta Google exibem resultado e
navegação direta") **permanece**: o resultado continua sendo exibido, agora com
animação e sem depender de o usuário reparar num parágrafo no meio do
formulário.

## Validação já executada

- TypeScript: `tsc --noEmit` limpo.
- Lint: 0 erros nos arquivos alterados; 2 avisos `@next/next/no-img-element`
  preexistentes em `LoginPortal.tsx`, não relacionados.
- Build e artefato do Sites: **aprovados**.
- Suíte com o build rodado: **286 de 287**. A única falha é
  `banner público é exibido inteiro e apresentação respeita margens móveis`,
  que falha igual na `main` sem esta entrega.
- Novo `tests/v200-google-oauth-session-return.test.mjs`, 6 testes.

**Correção de um número que circulou antes:** um relato anterior desta entrega
citou "40 falhas históricas". Estava errado. Aqueles 39 testes a mais falhavam
apenas porque a suíte tinha sido rodada sem `dist/` — eles leem o artefato do
build. Com o build feito, passam. A falha real e preexistente é uma só.

## Um teste seu foi atualizado

`tests/v198-theme-google-media-navigation.test.mjs` afirmava o texto literal
`"Abrindo a Conta Google com segurança"`, que era o parágrafo estático
substituído pelo aviso animado. A asserção foi trocada por
`title: "Abrindo a Conta Google"` mais a presença do `<GoogleStatusToast>`,
mantendo a intenção original do teste: verificar que o login informa sucesso ou
erro. As outras asserções do arquivo não foram tocadas.

## Passos

1. `git fetch origin claude/google-drive-nao-funciona-yybl7q`
2. Confira o diff contra `main`. Vale ler `app/lib/local-auth.ts` primeiro — a
   mudança de uma palavra (`Strict` → `Lax`) é a que resolve dois dos três
   sintomas.
3. Rode `scripts/pre-publicacao.sh`, que faz TypeScript, lint, build,
   validação do artefato e a suíte comparada com
   `tests/falhas-conhecidas.txt`. Ele sai com 1 se aparecer falha nova.
4. Integre em `main` e publique pelo fluxo do `COORDENACAO_IA.md` — credencial
   temporária por comando, nunca gravada em arquivo, log, commit ou URL.
5. Depois do push, `fetch` e confirme que `HEAD` e `origin/main` apontam para o
   mesmo commit antes de declarar concluído.
6. Registre a versão publicada na linha do Claude em `COORDENACAO_IA.md`.

## Verificação depois de publicar

O ponto todo desta entrega é o retorno do Google, então a conferência precisa
passar pelo Google de verdade — não adianta só abrir as telas.

- **Entrar com Google leva direto ao painel**, sem recarregar a página. Este
  era o sintoma principal.
- **Conectar o Drive em `/painel?view=conta`** e confirmar que, ao voltar, o
  cartão mostra "Conectado como ...", a data e as permissões concedidas. Antes
  desta correção a conexão não era gravada, então esse bloco nunca aparecia.
- **Desconectar e reconectar** — o aviso de sucesso deve aparecer nas duas
  ações.
- **Criar uma conta pelo cadastro** e confirmar que ela entra logada em
  `/sem-comunidade`, sem comunidade e sem permissões.
- Um erro forçado (recusar a autorização no Google) mostra o aviso vermelho, e
  ele **permanece na tela** até ser fechado.

## Isto continua pendente e não é código

Enquanto a tela de consentimento estiver com status **"Em teste"** no Google
Cloud, o refresh token expira em **7 dias**. A conexão do Drive vai quebrar
semanalmente e pedir reconexão mesmo com este código correto — não é defeito
desta entrega nem coisa que a publicação resolva.

Para uso contínuo é preciso publicar o app em produção e passar pela
verificação do Google, porque `drive.file` é escopo sensível. O
`GOOGLE_DRIVE_SETUP.md` recebeu nesta entrega a seção 2.1 com esse caminho e
com o passo de usuários de teste, que faltava no guia e era o motivo do
`Erro 403: access_denied` que bloqueava até a conta proprietária.
