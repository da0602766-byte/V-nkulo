# Prompt — Redesenho da área "Publicação do sistema" + vínculo Vínkulo ↔ Supabase

> **Como usar:** copie tudo que está abaixo da linha e entregue a uma IA de
> codificação (Claude Code, Codex, Cursor etc.) com acesso ao repositório.
> Este arquivo é o prompt; não é a implementação.

---

## 0. Identidade da tarefa

Você é um engenheiro sênior trabalhando no **VÍNKULO — Gestão de Comunidades**
(`da0602766-byte/V-nkulo`).

- **Branch de trabalho:** `claude/gallant-davinci-advdu2` (crie a partir da
  `main` se não existir; nunca faça push em outra branch).
- **Stack real:** TypeScript + React 19 + Next 16 rodando sob `vinext`/Vite,
  Cloudflare Workers, banco **D1** com **Drizzle ORM** (migrações versionadas
  em `drizzle/`), CSS próprio em `app/globals.css` (sem biblioteca de UI).
- **Comandos oficiais:** `npm run lint` · `npm test` (roda build + `node --test
  tests/*.test.mjs`) · `npm run build` · `npm run db:generate` (Drizzle).
- **Idioma de todo texto de interface, commit e documentação:** português do
  Brasil.

**Entrega final:** código funcionando, testado, commitado e enviado para a
branch acima, mais um relatório curto do que mudou.

---

## 1. Regras invioláveis (quebrar qualquer uma destas invalida a entrega)

1. **Segredos nunca chegam ao navegador.** Chave `service_role`, senhas,
   tokens e segredos existem apenas no servidor. Nenhuma resposta de API pode
   devolver o valor íntegro de um segredo — apenas máscara
   (`sb_secret_••••••••1234`), comprimento e data de atualização.
2. **Toda escrita passa por rota de servidor** em `app/api/…`, com verificação
   de sessão e de `user.system_owner` (padrão já existente em
   `app/api/proprietario/route.ts` e `app/api/pilot/platform-branding/route.ts`).
   Nada de gravar configuração direto pelo cliente.
3. **Isolamento entre comunidades permanece intacto.** Nenhuma consulta nova
   pode ler dados de uma comunidade sem filtro de `comunidade_id`.
4. **Toda alteração sensível gera auditoria** com `recordTenantAudit`
   (`app/lib/tenant-audit.ts`), com evento nomeado e resultado
   `SUCESSO`/`NEGADO`/`ERRO`, **sem** registrar o valor do segredo nos
   metadados.
5. **Nada de exclusão de dados, de tabelas ou de rotas** que não estejam
   explicitamente no escopo desta tarefa.
6. **Sem hidratação quebrada:** nada de `new Date()`, `window`, `localStorage`
   ou valores aleatórios calculados durante a renderização — use `useEffect`.
7. **Sem dependência nova** sem justificativa escrita. O projeto **não** usa
   `@supabase/supabase-js` hoje; prefira `fetch` contra a REST/Auth API do
   Supabase. Se julgar a biblioteca indispensável, pare e justifique antes de
   instalar.
8. **Não invente migração.** Só rode `npm run db:generate` se realmente criar
   ou alterar tabela/coluna, e então versione o SQL gerado em `drizzle/`.

---

## 2. Ordem de execução (obrigatoriamente sequencial)

Execute **uma etapa por vez**. Só avance para a próxima quando a anterior
estiver concluída, validada e commitada. Ao terminar cada etapa, escreva um
resumo de 3 a 6 linhas dizendo o que foi feito, o que foi validado e o que
ficou pendente.

| Etapa | Objetivo | Porta de saída (só avance com isto pronto) |
| --- | --- | --- |
| 0 | Diagnóstico e mapeamento | Lista de defeitos com `arquivo:linha` e a área confirmada |
| 1 | Redesenho da área | `npm run lint` e `npm run build` limpos; UI revisada nos 3 estados e 2 temas |
| 2 | Campos de conexão com o Supabase | Formulário salva, lê e mascara; auditoria gravando |
| 3 | Vínculo funcional Vínkulo ↔ Supabase | Teste de conexão real respondendo e status exibido |
| 4 | Testes, migração e validação | `npm test` verde, incluindo o teste novo |
| 5 | Commit, push e relatório | Branch enviada e relatório escrito |

---

## 3. Etapa 0 — Diagnóstico antes de qualquer edição

O proprietário relatou que a área **"Publicação do sistema"** da página do
proprietário (`/proprietario`, componente raiz `app/components/OwnerWorkspace.tsx`)
está **com defeitos e confusa**.

> **Atenção:** a expressão exata "Publicação do sistema" **não existe como
> string no código**. Antes de mexer em qualquer arquivo, identifique a área
> correspondente e **declare explicitamente qual você escolheu e por quê**.

Candidatos reais a inspecionar (todos alcançados pelas abas de
`OwnerWorkspace.tsx`):

- `app/components/PlatformControlsWorkspace.tsx` → aba **Configurações**,
  sub-aba *Módulos*, cartão `ai_auto_publish_enabled` rotulado **"Publicação
  automática real"**, e sub-aba *Conteúdo*, bloco "Feed público agregado
  removido".
- `app/components/EditorialAutomationWorkspace.tsx` → aba **IA Editorial**,
  fluxo de publicação manual com senha (`publishPasswords`).
- `app/api/pilot/publicacoes-plataforma/route.ts` e `[id]/route.ts` →
  publicações globais **desativadas**, respondendo `410`. Resíduo provável da
  confusão relatada.
- `app/components/PlatformOptimizerWorkspace.tsx` → aba **Otimização**.

Produza um **inventário de defeitos** antes de corrigir, cada item com:

1. `arquivo:linha`;
2. o que o usuário vê de errado (sintoma);
3. a causa técnica;
4. a correção proposta.

Cubra no mínimo: rótulos ambíguos ou contraditórios, botões sem efeito,
chamadas a endpoints aposentados (`410`), estados de carregamento/erro
ausentes, mensagens de erro genéricas, quebra de layout em 360 px e contraste
insuficiente em tema claro ou escuro.

**Se durante o inventário ficar claro que a área certa é outra**, diga isso e
peça confirmação antes de redesenhar — não redesenhe a tela errada.

---

## 4. Etapa 1 — Redesenho da área

Reescreva a área inteira. Não é maquiagem: a organização da informação precisa
ficar compreensível para quem nunca viu o sistema.

**Estrutura obrigatória da tela** (nesta ordem):

1. **Cabeçalho** com kicker, título, uma frase explicando em linguagem simples
   o que a área faz, e um selo de estado geral (`Tudo certo` / `Atenção` /
   `Falha`).
2. **Cartão de estado** com o que está ligado ou desligado *agora*, cada item
   com uma frase de consequência ("com isto desligado, nada é publicado
   automaticamente").
3. **Blocos por assunto**, um por vez, sem aninhar mais de dois níveis.
4. **Bloco de integrações** — onde entra o Supabase (Etapas 2 e 3).
5. **Rodapé de auditoria**: quem alterou o quê e quando, lido da trilha já
   existente.

**Requisitos técnicos do redesenho:**

- Reaproveite os padrões visuais já existentes (`pilot-kicker`,
  `workspace-heading`, `sensitive-action-note`, `control-summary-card`,
  `feature-flag-card`). Não crie um dialeto visual novo.
- CSS novo vai para o arquivo de estilo já usado pela área, com comentário
  explicando o bloco; **não** duplique regras existentes.
- Três estados tratados e visíveis: **carregando**, **vazio** e **erro**, com
  texto específico (nada de "Erro ao carregar").
- Responsivo de **360 px** até desktop largo, sem rolagem horizontal.
- Funciona em **tema claro e escuro**; contraste mínimo 4,5:1 para texto.
- Acessibilidade: todo campo com `<label>` associado, botões com nome
  acessível, `aria-live` nas mensagens de status, alvo de toque ≥ 44×44 px.
- Toda ação destrutiva ou sensível pede confirmação explícita.

**Porta de saída:** `npm run lint` e `npm run build` sem erro, e um resumo dos
defeitos da Etapa 0 que ficaram resolvidos.

---

## 5. Etapa 2 — Campos de conexão com o Supabase

Adicione, dentro do bloco de integrações, um formulário **"Conexão com o
Supabase"**.

### Campos

| Campo | Chave | Tipo | Obrigatório | Regra |
| --- | --- | --- | --- | --- |
| Ambiente | `ambiente` | seleção | sim | `PRODUCAO` ou `HOMOLOGACAO` |
| URL do projeto | `url` | texto | sim | precisa ser `https://` e terminar em `.supabase.co` (ou domínio próprio informado); rejeite `http://` |
| Referência do projeto | `projectRef` | texto | não | derivada da URL quando possível; somente `[a-z0-9-]` |
| Chave pública (anon) | `anonKey` | texto | sim | pode ser exibida; validar formato JWT ou `sb_publishable_…` |
| Chave secreta (service role) | `serviceRoleKey` | senha | sim | **segredo**: nunca volta ao cliente |
| Segredo do JWT | `jwtSecret` | senha | não | **segredo** |
| Schema padrão | `schema` | texto | não | padrão `public`; somente `[a-z0-9_]` |
| Bucket do Storage | `bucket` | texto | não | somente `[a-z0-9.-]` |
| Integração ativa | `ativa` | interruptor | sim | padrão **desligada** |

### Persistência

- Grave em `configuracoes`, chave **`supabase_integration`**, seguindo o mesmo
  `INSERT … ON CONFLICT(chave) DO UPDATE` usado em
  `app/api/pilot/platform-branding/route.ts`. **Não** crie tabela nova, e
  portanto **não** haverá migração nesta etapa.
- Os campos marcados como segredo **não** vão em texto puro no valor JSON:
  cifre-os no servidor com chave derivada de `AUTH_SECRET`
  (WebCrypto AES-GCM, disponível no Workers), guardando `iv` e `ciphertext`.
  Se preferir tratá-los como *binding* de ambiente
  (`SUPABASE_SERVICE_ROLE_KEY` em `db/runtime-env.ts`), então o formulário
  mostra apenas o estado ("configurado pelo ambiente") e não aceita digitação
  — escolha **um** dos dois caminhos e documente a escolha.
- O `GET` devolve somente: campos não secretos, máscara dos segredos, se cada
  segredo está definido, e data/autor da última alteração.

### Rotas

Crie `app/api/proprietario/integracoes/supabase/route.ts` com:

- `GET` — estado atual (mascarado).
- `PATCH` — grava/atualiza. Campo de segredo enviado **vazio** significa
  "manter o valor atual", nunca "apagar"; apagar exige um sinalizador
  explícito.
- `DELETE` — remove a integração, com confirmação obrigatória.

Todas guardadas por sessão válida **e** `user.system_owner`, devolvendo
`401` sem sessão e `403` para não-proprietário, com as mensagens no padrão já
usado no projeto ("Esta área é exclusiva do proprietário do sistema.").

Auditoria: `INTEGRACAO_SUPABASE_ATUALIZADA`, `INTEGRACAO_SUPABASE_REMOVIDA` e
`INTEGRACAO_SUPABASE_TESTADA` — metadados com ambiente, host e quais campos
mudaram; **nunca** com o valor do segredo.

**Porta de saída:** salvar, recarregar a página e ver os dados corretos, com
segredo mascarado e registro na auditoria.

---

## 6. Etapa 3 — Vínculo funcional entre Vínkulo e Supabase

Agora ligue de fato os dois sistemas.

### 6.1 Escopo — leia antes de codar

O escopo **padrão** desta entrega é **conexão verificada e observável**, e nada
além disso:

1. **Teste de conexão** — botão "Testar conexão" que, no servidor, chama
   `GET {url}/auth/v1/health` e `GET {url}/rest/v1/` com cabeçalho `apikey`,
   com **timeout de 8 segundos** e no máximo **uma** tentativa de repetição.
   O resultado mostra: alcançável (sim/não), código HTTP, latência em ms e
   mensagem legível. Erro de rede, chave inválida e projeto pausado precisam
   dar mensagens **diferentes**.
2. **Diagnóstico de leitura** — com a chave `service_role`, liste os buckets de
   Storage (`GET {url}/storage/v1/bucket`) e confirme se o bucket configurado
   existe. Somente leitura.
3. **Indicador de saúde** no cabeçalho da área, com a data da última
   verificação bem-sucedida.

**Não implemente** sincronização de dados, espelhamento de tabelas, migração do
D1 para o Postgres, autenticação via Supabase Auth ou upload de arquivos **sem
autorização explícita do proprietário**. Se o pedido original pretendia algo
disso, **pare ao fim do item 3 e pergunte**, apresentando: o que seria
sincronizado, em que direção, o que acontece em caso de conflito e o custo de
reversão. Migrar dados sem esse acordo é falha grave.

### 6.2 Camada de integração

- Crie `app/lib/supabase-integration.ts` com: leitura da configuração,
  decifragem dos segredos **somente no servidor**, `parse`/validação
  (espelhando o estilo de `app/lib/owner-laboratory.ts`), e as funções de
  verificação.
- Toda chamada externa: `cache: "no-store"`, timeout via `AbortController`,
  falha tratada — a área **nunca** pode ficar em branco porque o Supabase caiu.
- Nenhum segredo em log, em mensagem de erro ou em metadado de auditoria.
- Com a integração **desligada**, nenhuma chamada externa acontece.

**Porta de saída:** com credenciais inválidas, a tela mostra falha explicada;
com credenciais válidas, mostra sucesso com latência.

---

## 7. Etapa 4 — Testes e validação

1. Crie `tests/<versao>-owner-publicacao-supabase.test.mjs` seguindo o padrão
   dos testes existentes (`node --test`, sem framework externo). Cubra:
   - `GET`/`PATCH` negados para usuário sem sessão (`401`) e para usuário
     comum (`403`);
   - segredo **nunca** presente na resposta do `GET`;
   - campo de segredo vazio no `PATCH` preserva o valor anterior;
   - URL com `http://` ou domínio fora do padrão é rejeitada;
   - a área renderiza sem quebrar quando a configuração não existe.
2. Rode e cole a saída de: `npm run lint`, `npm test`, `npm run build`.
3. Confira `tests/pilot-security.test.mjs` e `tests/tenant-isolation-guard.test.mjs`
   continuam passando.
4. Se — e somente se — houve alteração de schema, rode `npm run db:generate` e
   versione o arquivo em `drizzle/` junto com a atualização de `db/schema.ts`.

**Se algum teste falhar, conserte antes de seguir.** Não marque etapa como
concluída com suíte vermelha, e não desative nem pule teste para ficar verde.

---

## 8. Etapa 5 — Entrega

1. Commits pequenos e descritivos, em português, um por etapa
   (ex.: `fix(proprietario): redesenha a área de publicação do sistema`,
   `feat(integracoes): adiciona conexão com o Supabase`).
2. `git push -u origin claude/gallant-davinci-advdu2`. Em falha de rede, tente
   novamente até 4 vezes (2s, 4s, 8s, 16s).
3. **Não abra pull request** a menos que seja pedido explicitamente.
4. Escreva o relatório final com:
   - a área identificada na Etapa 0 e por quê;
   - tabela dos defeitos encontrados × corrigidos;
   - arquivos criados e alterados;
   - como o proprietário preenche os campos do Supabase, passo a passo;
   - o que **não** foi feito e por quê (em especial, qualquer sincronização de
     dados não autorizada);
   - saída dos comandos de validação.

---

## 9. Critérios de aceite (marque item a item antes de declarar pronto)

- [ ] A área identificada está declarada no relatório, com justificativa.
- [ ] Todos os defeitos do inventário foram corrigidos ou justificados.
- [ ] Nenhum botão sem efeito; nenhuma chamada a endpoint aposentado (`410`).
- [ ] Estados de carregando, vazio e erro existem e têm texto específico.
- [ ] Layout íntegro em 360 px, tablet e desktop, em tema claro e escuro.
- [ ] Formulário do Supabase salva, relê e mascara os segredos.
- [ ] Segredo nunca aparece em resposta de API, log ou auditoria.
- [ ] `GET`/`PATCH`/`DELETE` negam acesso a quem não é proprietário.
- [ ] Botão de testar conexão devolve sucesso, falha de rede e chave inválida
      com mensagens diferentes.
- [ ] Integração desligada não dispara nenhuma chamada externa.
- [ ] `npm run lint`, `npm test` e `npm run build` passam.
- [ ] Teste novo cobre permissão, mascaramento e validação de URL.
- [ ] Commits feitos e branch enviada.

---

## 10. O que **não** fazer

- Não reescrever áreas fora do escopo ("já que estou aqui").
- Não remover feature flags, rotas ou tabelas existentes.
- Não migrar dados do D1 para o Supabase nesta entrega.
- Não trocar a autenticação atual por Supabase Auth.
- Não colocar chave ou URL de exemplo real no código nem em documentação.
- Não declarar concluído com teste falhando, `lint` sujo ou build quebrado.
- Não adivinhar: em dúvida material, pergunte — mas só depois de ter feito tudo
  que não depende da resposta.

---

## 11. Formato da resposta a cada etapa

```
### Etapa N — <nome>
O que fiz: …
O que validei: <comandos e resultado>
Riscos/pendências: …
Próxima etapa: …
```
