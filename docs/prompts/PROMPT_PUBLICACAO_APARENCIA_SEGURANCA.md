# Prompt de publicação — Central de Aparência, correções de segurança e alerta do otimizador

Copie daqui para baixo.

---

Você vai publicar a **Central de Aparência do Proprietário, duas correções de
segurança em rotas públicas, uma auditoria de permissões (sem alteração de
código) e um alerta de falha no Otimizador da Plataforma**, prontas e
validadas no branch `claude/system-improvement-suggestions-kv5zxt` do
repositório `da0602766-byte/V-nkulo`. Já existe o PR
[#8](https://github.com/da0602766-byte/V-nkulo/pull/8) aberto contra `main`
nesse mesmo repositório GitHub — use-o como referência do diff, mas a
publicação real é no repositório do Sites, pelo fluxo de sempre.

São **5 commits** (`c8893c1`, `82b033f`, `4758388`, `15a3dba`, `ca92cf3`),
14 arquivos, 925 linhas somadas e 207 removidas. O branch descende de
`origin/main` em `7198b54` e não está atrás dele:

```
git fetch origin claude/system-improvement-suggestions-kv5zxt main
git log --oneline origin/main..origin/claude/system-improvement-suggestions-kv5zxt
git diff --shortstat origin/main...origin/claude/system-improvement-suggestions-kv5zxt
```

## Sem migração — nenhum passo de banco antes do código

Nenhum dos 5 commits toca `db/schema.ts` ou `drizzle/`. Tudo usa a tabela
`configuracoes` (chave/valor) já existente, do mesmo jeito que o tema por
comunidade e o layout do proprietário já usam. **Basta publicar o código.**

## Convivência com outros branches

Só existem dois branches no repositório GitHub no momento desta entrega:
`main` e `claude/system-improvement-suggestions-kv5zxt`. Não há nenhum outro
trabalho em aberto para reconciliar.

## O que este trabalho entrega

**1. Central de Aparência do Proprietário** (`app/api/proprietario/aparencia/route.ts`
novo, `app/components/OwnerAppearanceWorkspace.tsx` novo,
`app/components/OwnerWorkspace.tsx`, `app/api/pilot/uploads/route.ts`,
`app/globals.css`)

Nova aba "Aparência" na Área do Proprietário. Antes de aplicar qualquer
mudança, escolhe-se o alcance: **uma comunidade específica** (com paleta,
logotipo, banner e papel de parede completos) ou **todas as comunidades de
uma vez** (só a paleta de cores, aplicada a todas com um clique). Logotipo,
banner e papel de parede nunca são sobrescritos no modo "todas" — cada
comunidade mantém sua própria identidade visual a menos que o proprietário
edite uma por uma.

Detalhe que importa para quem revisar: `app/api/pilot/uploads/route.ts`
ganhou um `targetCommunityId` derivado do campo `resourceId` já existente no
formulário de upload, mas só é considerado quando `user.system_owner ===
true` — para qualquer outra pessoa o comportamento de upload de
logotipo/banner de comunidade continua idêntico ao anterior (usa sempre a
comunidade ativa da sessão).

**2. Duas correções de segurança em rotas sem login**

- `app/api/auth/esqueci-senha/route.ts`: o endpoint não tinha limite de
  repetição — dava para chamá-lo sem parar para um e-mail cadastrado,
  gerando um token novo e **notificando pastores/administradores a cada
  chamada**, sem autenticação nenhuma. Agora uma nova solicitação é
  ignorada silenciosamente (mesma resposta genérica, sem vazar se o e-mail
  existe) enquanto houver uma pendente há menos de 2 minutos para o mesmo
  usuário.
- `app/api/public/celulas/[id]/solicitar/route.ts`: a verificação de
  solicitação pendente duplicada só rodava para quem estava logado; um
  visitante anônimo podia enviar a mesma solicitação sem parar e encher a
  fila de pendências do líder da célula. Agora a duplicidade também é
  verificada por `contato` para quem não tem sessão.

**3. Auditoria de permissões (líder/pastor/admin) — sem alteração de código**

Revisão de `app/lib/tenant.ts`, `app/lib/tenant-policy.mjs`,
`app/lib/ministry-access.ts` e do endpoint que promove pessoas
(`app/api/pilot/pessoas/route.ts` PATCH). Não foi encontrada nenhuma
brecha de escalonamento de privilégio; o único commit relacionado
(`15a3dba`) só adiciona o teste automatizado que faltava para a Central de
Aparência, descrito no diff acima.

**4. Alerta de falha na manutenção automática**
(`app/components/PlatformOptimizerWorkspace.tsx`, `app/globals.css`)

O backend do Otimizador da Plataforma já registrava `lastErrorAt` quando uma
execução automática falhava, mas o painel nunca mostrava isso — o
proprietário via "Automático ativo" em verde mesmo com falhas silenciosas
seguidas. Agora aparece um alerta vermelho quando há um erro mais recente
que a última execução bem-sucedida, com a data da falha e a opção de rodar
manualmente na hora. Some sozinho assim que uma execução concluir com
sucesso.

**5. Limpeza de código morto** (`app/components/RelacionamentoTools.tsx`,
`app/components/OwnerLaboratoryWorkspace.tsx`,
`app/api/public/cadastro-membro/[token]/route.ts`)

Removidas duas funções (`CadenciaContato`, `CadenciaAvancada`, ~170 linhas)
nunca renderizadas em nenhuma tela, e duas variáveis/funções não utilizadas
detectadas pelo lint.

## Avaliado e descartado nesta entrega (não fazer sem novo pedido)

- Converter `<img>` para `next/image`: o projeto já usa
  `ResponsiveFeedImage` de propósito para evitar o otimizador de imagens do
  Next nessas imagens externas (Drive, links variados).
- Reduzir intervalos de `setInterval`: os já existentes já são
  proporcionais ao que cada um sincroniza.
- ~~Mover os `.md` da raiz para `docs/`~~: feito em 08/09/2026, a pedido
  explícito do proprietário (não fazia parte desta entrega). Os arquivos
  interligados por caminho fixo (`COORDENACAO_IA.md`, os `PROMPT_PUBLICACAO_*.md`,
  `ESTADO_DO_PROJETO.md`, `REFORMA_VISUAL_V5.md` e os guias do Google) foram
  movidos juntos para `docs/coordenacao/`, `docs/prompts/` e `docs/guias/`,
  e toda referência cruzada entre eles foi atualizada para o novo caminho.
  Este prompt já foi ajustado de acordo (ver `docs/coordenacao/COORDENACAO_IA.md`
  abaixo). Ao publicar esta entrega, use os caminhos novos — `main` ainda
  não tem essa reorganização até este PR ser integrado.

## Testes novos

| Arquivo | Cobre |
| --- | --- |
| `tests/v229-owner-appearance-center.test.mjs` | Pessoa comum recebe 403 em leitura e escrita na Central de Aparência; alcance "uma comunidade" só altera a comunidade escolhida e preserva o logotipo dela; alcance "todas" muda a paleta de ambas as comunidades sem tocar no logotipo de nenhuma; os dois eventos de auditoria são gravados; o `resourceId` de comunidade-alvo no upload só é aceito vindo do proprietário. |
| `tests/v230-optimizer-failure-alert.test.mjs` | Uma falha real na manutenção (forçada renomeando temporariamente uma tabela usada só por uma das seis tarefas, sem tocar em sessão/login) fica registrada; a execução seguinte bem-sucedida volta a ficar mais recente que o erro; o painel contém o alerta e a classe CSS correspondente. |

## Validação já executada

- `npx tsc --noEmit`: limpo em todos os 5 commits.
- `npx eslint . --ignore-pattern dist --ignore-pattern .next`: 0 erros,
  43 avisos pré-existentes (eram 45; dois de variável não utilizada foram
  corrigidos nesta entrega — todos os restantes são `@next/next/no-img-element`
  já conhecidos).
- `node_modules/.bin/vinext build` e validação do artefato: aprovados após
  cada commit.
- `node --test tests/*.test.mjs`: **321 de 321 testes passando** no commit
  final (`ca92cf3`), incluindo os dois arquivos novos acima.

## Passos

1. `git fetch origin claude/system-improvement-suggestions-kv5zxt`
2. Confira o diff contra `main` (não há migração para ler ou aplicar).
3. Integre em `main` e publique pelo fluxo do `docs/coordenacao/COORDENACAO_IA.md` —
   credencial temporária por comando, nunca gravada em arquivo, log, commit
   ou URL.
4. Depois do push, `fetch` e confirme que `HEAD` e `origin/main` apontam
   para o mesmo commit antes de declarar concluído.
5. Registre a versão publicada na linha correspondente do
   `docs/coordenacao/COORDENACAO_IA.md` (as cinco linhas já registradas por esta entrega
   estão datadas de 2026-09-08; adicione a versão e a URL publicada nelas
   ou em uma linha de fechamento, como de costume).
6. Feche o PR [#8](https://github.com/da0602766-byte/V-nkulo/pull/8) como
   integrado, referenciando o commit publicado no Sites.

## Verificação depois de publicar

- Entrar como proprietário, abrir a Área do Proprietário → aba
  **Aparência**: a lista de comunidades carrega, trocar a paleta de "Uma
  comunidade" e salvar reflete só naquela comunidade; trocar em "Todas as
  comunidades" muda a cor de todas sem apagar nenhum logotipo.
- Entrar como pessoa comum (sem ser proprietário): a aba Aparência não deve
  aparecer na Área do Proprietário nem responder com sucesso se chamada
  diretamente pela API.
- Chamar "Esqueci minha senha" duas vezes seguidas para o mesmo e-mail
  cadastrado: a segunda chamada não deve gerar uma nova notificação para a
  liderança nem um novo token enquanto a primeira ainda estiver dentro de
  2 minutos.
- Enviar duas solicitações de entrada na mesma célula pública, sem estar
  logado, com o mesmo contato: a segunda deve ser recusada como duplicada.
- Na Área do Proprietário → aba **Otimização**: se uma execução automática
  falhar (não deve acontecer em uso normal), o alerta vermelho aparece; ao
  rodar manualmente com sucesso, ele some.
