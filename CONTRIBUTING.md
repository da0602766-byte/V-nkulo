# Como contribuir com o VÍNKULO

Este arquivo reúne, em um lugar só, o que antes estava espalhado entre
`docs/coordenacao/COORDENACAO_IA.md`, `drizzle/README.md` e os relatórios de
publicação. Quem for mexer no código lê isto primeiro; os detalhes de cada
assunto continuam nos arquivos originais, apontados ao longo do texto.

## Antes de começar

1. Leia **`docs/coordenacao/ESTADO_DO_PROJETO.md`**. Ele é a fonte das
   decisões vigentes (quem cria comunidade, o que é público, o que está
   desativado de propósito). Uma alteração que contrarie uma decisão de lá
   precisa ser autorizada pelo proprietário antes de ser escrita, não depois.
2. Leia **`docs/coordenacao/COORDENACAO_IA.md`** e preencha uma linha na
   tabela **Trabalho em andamento**, reservando os arquivos que pretende
   alterar. É o que evita duas pessoas (ou dois agentes) reescrevendo a mesma
   tela em paralelo.
3. Rode `git status` e `git diff` antes de editar: pode haver trabalho em
   curso na árvore.

## Ambiente

```bash
npm run install:ci   # instala as dependências pelo mesmo caminho do ambiente hospedado
npm run dev          # sobe o Vite + Worker local
```

Use `npm run install:ci` em vez de `npm install`. Ele isola `HOME` e o cache
do npm em `.sites-runtime/`, garante um único `npm ci` por vez (flock) e
confere a integridade do tarball do `vinext` contra o `package-lock.json`.

Segredos (`AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, …) vivem
em `.dev.vars` local e no ambiente hospedado. **Nunca** em arquivo versionado,
nunca no frontend — há um teste que falha se um segredo aparecer no código
(`tests/release-security.test.mjs`).

## Validação antes de publicar

A ordem importa e não é arbitrária:

```bash
npm run lint          # ESLint
npm run build         # gera dist/ e valida o artefato do Sites
npm run typecheck     # tsc --noEmit — precisa do build antes
npm run test:nobuild  # a suíte, reaproveitando o build acima
```

- **O `typecheck` precisa vir depois do build.** É o build que gera
  `next-env.d.ts` e `.next/types`, de onde saem os tipos de `next/*` e das
  rotas. Rodar `tsc` antes produz centenas de erros falsos de "módulo não
  encontrado" — não são erros reais do código.
- **Os testes também precisam do build.**
  `tests/pilot-integration.test.mjs` importa `dist/server/index.js`, o Worker
  empacotado. Sem build, ~54 testes falham por módulo ausente.
- `npm test` faz build + testes de uma vez; `npm run test:nobuild` serve para
  repetir a suíte sem reconstruir.

O mesmo encadeamento roda sozinho em `.github/workflows/ci.yml` a cada push e
pull request.

## Testes

A suíte usa `node --test` puro, sem framework, com dois padrões bem definidos:

- **Lógica pura vai para `.mjs`** (`app/lib/tenant-policy.mjs`,
  `app/lib/rate-limit-policy.mjs`, `app/lib/logger.mjs`, …) e é importada
  diretamente pelo teste. É o que permite testar a regra sem build e sem
  banco. Prefira esse formato para qualquer decisão que valha a pena travar.
- **Código TypeScript é verificado por leitura do fonte** (`readFile` +
  `assert.match`), garantindo que a proteção continua no lugar. É mais frágil
  que um teste de comportamento, mas pega remoção acidental.
- **Comportamento com banco** usa `tests/helpers/sqlite-d1.mjs`, que aplica
  todas as migrações de `drizzle/` em um SQLite em memória.

Nomeie o arquivo por versão/assunto, seguindo o que já existe
(`tests/v240-rate-limit-autenticacao.test.mjs`).

## Migrações

Leia `drizzle/README.md` **inteiro** antes de criar uma. Em resumo:

- O próximo número livre está declarado lá, e há um teste que falha se o
  README e os arquivos saírem de sincronia — ao adicionar uma migração,
  atualize o README na mesma alteração.
- Escreva o `.sql` à mão. **Não rode `npm run db:generate` sem revisar**: os
  snapshots do Drizzle estão parados em `0048` e a ferramenta geraria uma
  migração incorreta.
- Mantenha `db/schema.ts` alinhado com a tabela criada, para a reconciliação
  futura descrita no README.
- Renumere sempre a migração que chega depois, nunca a que já foi publicada.

## Commits

- Formato convencional em português: `feat(escala): ...`, `fix(tema): ...`,
  `docs: ...`, `refactor(cultos): ...`.
- Um commit, uma finalidade. Não carregue alteração de outra pessoa junto.
- Registre no commit o que foi validado (build, testes, navegador) quando a
  mudança for funcional.

## Onde as coisas ficam

| Assunto | Arquivo |
| --- | --- |
| Decisões vigentes e limitações | `docs/coordenacao/ESTADO_DO_PROJETO.md` |
| Coordenação e trabalho em andamento | `docs/coordenacao/COORDENACAO_IA.md` |
| Histórico de versões | `CHANGELOG.md` |
| Convenção de migrações | `drizzle/README.md` |
| Relatórios detalhados por bloco | `docs/relatorios/` |
| Guias de configuração (Google, passo a passo) | `docs/guias/` |

## Limites que não se contornam

Estes vêm das decisões registradas em `ESTADO_DO_PROJETO.md` e valem para
qualquer alteração:

- Nenhuma comunidade enxerga dado operacional de outra. Toda consulta e toda
  mutação passam pelo tenant resolvido no servidor.
- Autorização é do servidor. Esconder um botão não é proteção.
- Comunidade só é criada pelo proprietário global, a partir de uma
  solicitação persistida.
- A plataforma não persiste foto, arquivo ou mensagem nova em bucket próprio:
  só referências, preferências e metadados.
- Não há processamento de pagamento.
