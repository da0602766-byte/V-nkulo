# Prompt de publicação — vidro translúcido sem desfoque no tema claro

Copie daqui para baixo.

---

Você vai publicar a **correção do "modo vidro" no tema claro**, que deixava a
folha de menu/conta móvel, o card "Trocar comunidade" e os botões da grade com
uma lavagem cinza suja em vez de brancos e nítidos. Pronta e validada em
`main`, **3 commits locais ainda não enviados a `origin/main`**:
`cb4cb35`, `51543b7`, `d06d8ad`. Não há branch nem PR — foi feito direto em
cima do `origin/main` mais recente (`7198b54`), então é um fast-forward puro:

```
git fetch origin main
git log --oneline origin/main..main
git diff --shortstat origin/main...main
```

## Sem migração — nenhum passo de banco antes do código

Nenhum dos 3 commits toca `db/schema.ts` ou `drizzle/`. É só CSS e dois
números em componentes existentes. **Basta publicar o código.**

## O defeito e por que ele existia

Em `app/globals.css`, a regra do tema claro escolhido manualmente
(`html[data-pilot-theme="claro"]`, bloco "V197 — acabamento móvel") desligava
o `backdrop-filter` (desfoque de vidro) na folha do menu/conta e afins, mas
deixava o fundo deles em `var(--pilot-surface)` — que dentro do
`.pilot-dashboard[data-ui-version="v2"]` é translúcida, ligada ao slider
"Intensidade do vidro". Transparência sem nenhum desfoque atrás mostrava a
camada escura de fundo do modal sem suavização: o cinza sujo reportado com
capturas de tela (conta ativa e menu geral, tema claro).

## O que este trabalho entrega

**1. A causa raiz** (`app/globals.css`) — cria `--pilot-surface-opaque` (o
mesmo branco de `--pilot-surface` no claro, sem canal alfa) e troca as 4
regras do bloco "V197" para usá-la, preservando a intenção original
(superfície mais sólida no claro) de forma realmente opaca.

**2. Duas superfícies fora da lista de vidro** (`app/globals.css`) —
`.pilot-mobile-sheet` e `.pilot-profile-community-switcher` não recebiam o
tratamento (`backdrop-filter: blur(18px) saturate(135%)` + borda clara) que
outras superfícies v2 já recebiam. Adicionadas à lista, como defesa extra
para quando o tema claro não foi escolhido manualmente.

**3. `--violet-soft` fixa em 10%/15% de opacidade** (`app/globals.css`) — era
o fundo dos cards internos no modo vidro, praticamente invisível e sem
relação nenhuma com o slider. Subida para ~80% opaca nos dois temas,
coerente com o próprio comentário do arquivo ("superfícies transparentes,
**legíveis** e responsivas").

**4. Piso do slider "Intensidade do vidro"** (`app/components/PilotDashboard.tsx`,
`app/layout.tsx`) — o mínimo era 45%, baixo o bastante para ficar feio mesmo
com os três ajustes acima. Subido para 55% nos três lugares onde esse número
existia: o `<input type="range">`, a validação ao carregar a preferência
salva do `localStorage`, e o script inline em `layout.tsx` que aplica essa
preferência antes da hidratação (evita um flash do valor antigo em quem já
tinha 45–54% salvo).

**5. Organização dos `.md` da raiz para `docs/`** — sem relação com o defeito
acima; feito no mesmo lote a pedido do proprietário. Detalhes no commit
`cb4cb35` e em `docs/README.md`.

## Avaliado e descartado nesta entrega (não fazer sem novo pedido)

- **`html[data-data-saver="true"] .pilot-dashboard :is(.pilot-topbar,
  .pilot-sidebar,.pilot-mobile-nav,[class*="-card"],[class*="-panel"])`**
  (também em `app/globals.css`) tem o mesmo padrão de defeito: desliga
  `backdrop-filter` com "Economizar dados" ligado ou rede lenta, sem forçar
  opacidade, e o seletor `[class*="-card"]`/`[class*="-panel"]` é amplo —
  pega qualquer classe com esse pedaço no nome, nos dois temas. Não mexido
  porque exigiria conferir visualmente cada tipo de card afetado, e não é a
  causa do defeito relatado ("Economizar dados" estava desligado nas
  capturas). Fica registrado para não ser redescoberto do zero.

## Testes

Nenhum teste automatizado novo — é um ajuste de opacidade/alfa em CSS
(`color-mix`, canal alfa de `rgb()`), que `node --test` não tem como afirmar
sem um runner visual. Verificado reconstruindo o app e visualmente (ver
"Verificação depois de publicar").

## Validação já executada

`scripts/pre-publicacao.sh` (checagem completa, não `--rapido`), em `d06d8ad`:

- TypeScript: limpo.
- Lint: 0 erros, 45 avisos pré-existentes.
- Build e artefato do Sites: aprovado.
- Suíte: **317 de 317 testes passando**, nenhuma falha nova. Um teste que
  antes falhava ("banner público é exibido inteiro...") voltou a passar por
  causa dos 5 commits que já estavam em `origin/main` antes deste trabalho
  (não deste fix) — a linha foi removida de `tests/falhas-conhecidas.txt`
  no commit `d06d8ad`, como o próprio arquivo instrui.

## Passos

1. `git push origin main` — fast-forward puro (local é `origin/main` mais
   estes 3 commits, sem divergência: já fiz `git rebase origin/main` antes
   de commitar o fix, então não há merge nem conflito).
2. Publique pelo fluxo do `docs/coordenacao/COORDENACAO_IA.md` — credencial
   temporária por comando, nunca gravada em arquivo, log, commit ou URL.
3. Depois do push no Sites, `fetch` e confirme que `HEAD` e `origin/main`
   apontam para o mesmo commit antes de declarar concluído.
4. Registre a versão publicada na linha correspondente do
   `docs/coordenacao/COORDENACAO_IA.md`.

## Verificação depois de publicar

- Tema → escolher **Claro** explicitamente (não deixar em automático).
- Abrir o menu móvel (ícone de menu) → **Menu geral**: os 10 botões da grade
  (Início, Fio do dia, Agenda, Ministérios...) e as 3 linhas do topo
  (Mensagens, Atualizações, Avisar neste celular) devem estar brancos e
  nítidos, sem lavagem cinza.
- Abrir **Conta ativa** → **Perfil e configurações** → **Aparência**: arrastar
  "Intensidade do vidro" até o mínimo (55%) — a folha inteira, "Comunidade
  ativa", "Trocar comunidade" e "Ver página pública" continuam legíveis, sem
  ficar cinza/suja.
- Abrir "Trocar comunidade": a lista de comunidades deve ter fundo sólido,
  não translúcido.
- Repetir os mesmos passos no tema **Escuro** — não deve ter mudado nada lá
  (o bloco corrigido só existe para `data-pilot-theme="claro"`).
