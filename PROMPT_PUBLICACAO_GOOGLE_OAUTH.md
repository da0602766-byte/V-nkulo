# Prompt de publicação — para o Codex/ChatGPT

Copie daqui para baixo.

---

Você vai publicar a **preparação de login Google e Google Drive para
verificação OAuth**, pronta no branch `feat/layout-e-tema` do repositório
`da0602766-byte/V-nkulo`. O branch já está com `origin/main` mesclado —
inclusive as correções que você já publicou em `relacionamento`/`agenda`
(funil, categorias reais, escopo de permissão, migrações idempotentes)
entraram automaticamente, sem conflito.

## Sem migração desta vez

Esta entrega **não cria nem altera nenhuma tabela**. É só código de
aplicação e três páginas públicas novas/editadas. Nenhuma migração precisa
ser aplicada em produção antes de subir o código.

## O que publicar

```
git log --oneline --reverse origin/main..origin/feat/layout-e-tema
git diff --shortstat origin/main...origin/feat/layout-e-tema
```

Na última medição: 12 arquivos, 545 linhas somadas e 6 removidas — bem
pequeno, porque a implementação de OAuth que já existia (login e Drive
separados, escopo `drive.file`, token criptografado, `state` assinado)
já estava correta; entrei só onde havia lacuna real.

| O que entra | Onde |
| --- | --- |
| HTTPS obrigatório no fluxo OAuth em produção (só localhost escapa) | `app/lib/google-integration.ts` |
| Status "Conta Google" separado do status "Google Drive" em Minha conta | `app/api/storage/preferences/route.ts`, `app/components/StoragePrivacyWorkspace.tsx` |
| Política de Privacidade: escopos detalhados, referência à Google API Services User Data Policy, seção de exclusão | `app/privacidade/page.tsx` |
| Termos de Uso: seção curta sobre Conta Google/Drive | `app/termos/page.tsx` |
| Página nova: exclusão de conta e de dados | `app/exclusao-de-dados/page.tsx` |
| Página nova: contato/suporte | `app/contato/page.tsx` |
| Lista central de e-mails de contato (hoje: `da0602766@gmail.com`) | `app/lib/contact-emails.ts` |
| Rodapé da home linkando as páginas novas | `app/page.tsx` |
| Estilos das duas linhas novas de status/link | `app/globals.css` |

## Verificação já feita antes de mandar

- `npm run lint` → 0 erros (warnings pré-existentes de `<img>`, nenhum novo)
- `npm run build` → sucesso, `/contato` e `/exclusao-de-dados` registradas
  como rotas estáticas, igual `/privacidade` e `/termos`
- `node --test tests/*.test.mjs` → **281/281** passando, depois do merge
  com suas correções de relacionamento/agenda (incluindo os 5 testes novos
  de `tests/v199-relationship-agenda-security.test.mjs`)
- Varredura de segredo no histórico completo (`git log --all`): nada
  encontrado, nos arquivos novos e nos alterados

## Pendências que EU não resolvi — para você (ou o Douglas) decidir depois

Isto não é código quebrado, é conteúdo que só existe como placeholder
porque não me foi dado um dado real. Não tente adivinhar o valor —
pergunte ao Douglas antes de preencher:

1. **`app/contato/page.tsx`** — `[Razão social / responsável legal a
   definir]` e o endereço, na seção "Responsável pela plataforma". Só
   necessário se o Google pedir isso na etapa de verificação.
2. **`app/exclusao-de-dados/page.tsx`** — item 4, "Prazo de atendimento a
   definir". Hoje a exclusão de conta é só por solicitação manual (não há
   botão de autoexclusão no produto); esse texto promete um prazo que
   ainda não foi definido.
3. **`app/lib/google-integration.ts`, função `credentialSecret()`** — hoje
   `GOOGLE_CREDENTIALS_SECRET` cai no fallback de `AUTH_SECRET` se a
   primeira não estiver definida em produção. Funciona, mas mistura o
   segredo de sessão com o de criptografia de token do Google. **Não
   mudei isso** porque, se `GOOGLE_CREDENTIALS_SECRET` nunca foi definida
   e algum usuário já conectou o Drive, os refresh tokens dele foram
   criptografados com a chave derivada de `AUTH_SECRET` — trocar agora sem
   migração tornaria esses tokens ilegíveis e quebraria o Drive de quem já
   conectou. Se algum dia for separar as duas, precisa descriptografar com
   a chave antiga e recriptografar com a nova antes de trocar a env var.
4. **App Android** — não encontrei `AndroidManifest.xml` no projeto (a
   pasta `Vinkulo-Android/` só tinha cache de build). Não consegui
   confirmar se o app registra `scheme=vinkulo` e
   `package=com.vinkulo.app`, que é o que
   `app/components/GoogleAppReturn.tsx` espera ao voltar do navegador. Se
   você tiver acesso ao código-fonte do Android, vale conferir antes de
   depender desse fluxo em produção.
5. **Testing vs. Production no Google Cloud Console** — nem eu nem o
   Douglas sabemos em qual dos dois o app está hoje. O login funcionar não
   decide isso sozinho (pode ser Testing com o e-mail dele na lista de
   test users). O checklist completo para publicar está em
   `GOOGLE_OAUTH_VERIFICACAO.md`, seção 16-18.

## O que conferir depois de publicar

1. Abrir `/contato` e `/exclusao-de-dados` sem estar logado — devem
   carregar como página pública, igual `/privacidade`.
2. Rodapé da home (`/`) mostrando os 4 links: Privacidade, Termos,
   Exclusão de dados, Contato.
3. Entrar com Google → ir em Minha conta → Privacidade e armazenamento →
   confirmar que aparece "Conta Google — Vinculada · [e-mail]" **mesmo
   sem o Drive estar conectado**.
4. Tentar iniciar o login/Drive por uma origem `http://` que não seja
   localhost deve falhar com "A autenticação com o Google exige uma
   conexão segura (HTTPS)." — normalmente não é testável em produção
   (que já é HTTPS), mas vale saber que existe esse guard agora.

## Aviso de segurança — repita a verificação de integridade

Mesma recomendação de sempre, porque já aconteceu antes com `globals.css`
e `TenantOperations.tsx`:

```
wc -c app/globals.css app/lib/google-integration.ts
head -c 100 app/globals.css
tail -c 100 app/globals.css
```

Se `app/globals.css` aparecer muito menor do que o esperado (hoje passa de
1,3 MB) ou com bytes não-texto, pare e refaça a transmissão.
