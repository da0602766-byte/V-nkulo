# Prompt de publicação — para o Codex

Copie daqui para baixo.

---

Você vai publicar o **redesenho completo da aba "Estacionamento" (agora
"Gestão")**, pronto e validado no branch `claude/tender-thompson-jvz3ke` do
repositório `da0602766-byte/V-nkulo`. Não há pull request aberto ainda —
abra um a partir deste branch, ou integre direto em `main` se for o seu
fluxo de costume.

## Antes de tudo: não há migração

**Nenhuma alteração de banco.** Não rode `drizzle-kit generate`, não aplique
nada em `drizzle/` e não mexa no journal. Todas as mudanças são de
frontend, mais três ajustes pequenos de backend que reaproveitam tabelas
já existentes (`ministerio_voluntarios`, `ministerios_comunidade`).

## O que publicar

### Redesenho completo, sem reaproveitar a UI anterior

A aba passa a se chamar **"Gestão"** (rótulo do menu; a URL interna
continua `?view=estacionamento` de propósito, para não quebrar nada que
aponte para ela). O componente único de ~1600 linhas
(`app/components/ParkingWorkspace.tsx`) virou um orquestrador fino que
escolhe, por permissão e por largura de tela, entre três experiências
novas em `app/components/parking/`:

- **`ParkingMemberPortal`** — reserva de vaga: mapa por setor
  (livre/reservada/ocupada), painel de reserva, comprovante em QR Code,
  histórico de reservas e uma **garagem de veículos salva pelo próprio
  usuário** neste aparelho (várias placas, não uma só).
- **`ParkingOperatorMobile`** — tela do auxiliar escalado no celular: só
  aparece durante a janela da escala confirmada (fora disso, a pessoa cai
  automaticamente na tela de membro). Leitor de QR por câmera com
  animação de acerto/erro, lista de quem reservou e de quem já fez
  check-out, cronômetro visível do tempo restante da escala (fica
  vermelho pulsando nos últimos minutos) e **envio automático do
  relatório da escala** para o líder quando o tempo acaba.
- **`ParkingManagementConsole`** — console de gestão (líder do ministério,
  administração, ou qualquer acesso pelo computador): visão geral,
  entradas/saídas, reservas e cancelamentos, ocorrências, relatórios em
  formato de formulário, e edição ampla do mapa (arrastar vagas, editar
  setor, criar setores e vagas).

CSS novo com prefixo `.gestao-` em `app/globals.css`; o CSS antigo
`.parking-*` **foi deixado no arquivo de propósito** (código morto, não
usado por nenhum componente novo) — removê-lo exigiria vasculhar as ~640
ocorrências espalhadas por um arquivo de 33 mil linhas sem nenhum ganho
funcional, então ficou para uma limpeza futura dedicada, não misturada com
o redesenho.

### Três regras de negócio mudaram

1. **Líder do ministério de estacionamento entra na Gestão quando quiser**,
   sem precisar estar escalado no momento — `getParkingLeaderPermissions`
   em `app/lib/tenant.ts` concede acesso permanente a quem é
   `responsavel_usuario_id` do ministério de categoria `ESTACIONAMENTO` ou
   voluntário ativo com papel `LIDER` nele. Antes, só administração/pastor
   tinham acesso permanente; um líder de ministério comum dependia de
   estar escalado.
2. **Escalar auxiliar agora exige que a pessoa já esteja no ministério de
   estacionamento** (`app/api/pilot/estacionamento/auxiliares/route.ts`) —
   antes, o convite inscrevia automaticamente qualquer pessoa da
   comunidade no ministério. A resposta 404 de "pessoa fora da comunidade"
   (isolamento entre tenants) foi mantida separada da 403 de "pessoa fora
   do ministério" — são dois erros diferentes por design, não misture as
   mensagens numa correção futura.
3. `GET /api/pilot/estacionamento` passa a expor `ministryMembers` (só
   voluntários ativos do ministério) para alimentar essa restrição na
   tela.

### Três defeitos visuais encontrados e corrigidos depois do redesenho

Reportados pelo dono do projeto ao ver a prévia no celular, todos em
`app/globals.css`:

1. O botão **"Confirmar"** de uma reserva pendente estava sem classe CSS,
   então ficava sem estilo algum ao lado do botão "Recusar / cancelar".
2. A regra `.gestao-reservation-table article > div` também acertava
   `.gestao-row-actions` (também um `<div>` filho direto do `<article>`),
   empilhando os dois botões de ação em coluna cheia em vez de lado a
   lado. Seletor restrito com `:not(.gestao-row-actions)`.
3. **O painel de reserva (bottom sheet) ficava por baixo do menu inferior
   fixo do celular** e, além disso, **translúcido** o bastante para
   atrapalhar a leitura sobre o mapa de vagas atrás dele. Duas causas
   raiz distintas, confirmadas cada uma numa captura de tela real do
   navegador (não simulada):
   - `z-index` empatado em 60 com `.pilot-mobile-nav` — elevado para
     `1200`, a mesma faixa dos outros modais do produto
     (`.cell-create-overlay-v2`, `.visitor-registration-backdrop`).
   - O fundo usava `var(--pilot-surface)`, que segue a opacidade de
     "vidro" ajustável do usuário (pensada para cartões sobre o fundo da
     própria página, não para um modal). Substituído por
     `var(--pilot-bg)`, o fundo sólido e sempre opaco da página nos dois
     temas. **Atenção para quem for mexer aqui de novo:** sobrescrever
     `--vinkulo-glass-alpha` num elemento descendente **não funciona** —
     a substituição de `var()` numa propriedade customizada já resolve a
     cadeia no elemento onde `--surface` foi declarada (`.pilot-dashboard`
     mesmo), então um `--vinkulo-glass-alpha` redeclarado mais embaixo na
     árvore chega tarde demais. Confirmado testando as duas abordagens.

## O que foi preservado do trabalho anterior

- Nenhum contrato de API mudou além dos três pontos citados acima —
  `app/api/pilot/estacionamento/{reservas,mapa,configuracao,ocorrencias,
  disponibilidade,[id]}/route.ts` continuam exatamente como estavam.
- `ParkingReservationQr.tsx` (QR Code e leitor por câmera) não foi tocado;
  os componentes novos só o importam e reutilizam.
- Nenhuma regra de isolamento entre comunidades mudou.

## Validação já executada

`scripts/pre-publicacao.sh` completo, aprovado:

```
1. Dependências        presentes
2. TypeScript          limpo
3. Lint                0 errors, 42 warnings
4. Build e artefato    aprovado (Worker ESM e hosting.json presentes)
5. Suíte de testes     354 passaram, 0 falharam
```

Os ~13 arquivos de teste que liam literalmente o código-fonte da
implementação anterior (`tests/v151-parking-qr.test.mjs`,
`tests/v152-*.mjs`, `tests/v154-*.mjs`, `tests/v155-*.mjs`,
`tests/v165-*.mjs`, `tests/v166-*.mjs`, `tests/v179-*.mjs`,
`tests/v180-*.mjs`, `tests/v191-*.mjs`, `tests/v197-*.mjs`,
`tests/vinkulo-guide-updates.test.mjs`, `tests/pilot-security.test.mjs`,
`tests/pilot-integration.test.mjs`) foram atualizados para verificar o
comportamento novo equivalente — nenhum teste foi apagado sem uma
verificação substituta. O teste funcional de check-in por QR Code (fim a
fim, contra um worker de verdade) continua passando sem alteração de
asserção.

### QA visual manual, fora do script

Como o redesenho é majoritariamente visual, também rodei o app de verdade
(build de produção + banco de exemplo semeado com um líder permanente, um
auxiliar em plantão e um membro, via um harness Playwright descartável) e
tirei capturas de tela reais do Chromium nas três experiências, no celular
e no computador, incluindo o painel de reserva aberto e o comprovante em
QR — não só os testes automatizados. Foi nesse processo que os três
defeitos da seção anterior apareceram e foram corrigidos antes desta
publicação.

## Passos

1. `git fetch origin claude/tender-thompson-jvz3ke`
2. Confira o diff contra `main` (`git diff origin/main...
   claude/tender-thompson-jvz3ke`) — 4 commits, 28 arquivos.
3. **Não aplique migração.** Esta rodada não tem nenhuma.
4. Integre em `main` (PR ou merge direto, como for seu fluxo) e publique
   no Sites pelo processo do `docs/coordenacao/COORDENACAO_IA.md` —
   credencial temporária por comando, nunca gravada em arquivo, log,
   commit ou URL.
5. Depois do push, `fetch` e confirme que `HEAD` e `origin/main` apontam
   para o mesmo commit antes de declarar concluído.
6. Registre a versão publicada nas linhas do Claude em
   `docs/coordenacao/COORDENACAO_IA.md`.

## Verificação depois de publicar

- **Menu lateral/inferior**: o item antes chamado "Estacionamento" agora
  aparece como **"Gestão"**.
- **Como membro comum**: `/painel?view=estacionamento` mostra o mapa de
  vagas por setor; tocar numa vaga livre abre um painel de reserva com
  fundo sólido (não translúcido) e por cima do menu inferior no celular;
  ao concluir, aparece um comprovante em QR Code com contagem regressiva
  de validade; a seção "Meus veículos" existe mesmo vazia.
- **Como líder do ministério de estacionamento** (via
  `ministerio_voluntarios.papel = 'LIDER'` ou
  `ministerios_comunidade.responsavel_usuario_id`, categoria
  `ESTACIONAMENTO`): a Gestão abre normalmente **mesmo sem escala ativa**,
  com a etiqueta "acesso permanente" ao lado do nome; no celular, continua
  vendo o console completo (não a tela restrita de operador).
- **Como auxiliar comum com escala confirmada e ativa**: no celular, a
  tela mostra o cronômetro da escala, o leitor de QR, quem reservou e os
  check-outs; ao tentar escalar outra pessoa que **não** está no
  ministério, a Gestão recusa com a mensagem "Somente pessoas já
  cadastradas no ministério de estacionamento podem ser escaladas."
- Um membro de outra comunidade continua sem ver vagas, reservas ou
  placas desta comunidade em nenhuma tela.

Se algo dessa lista falhar, os quatro commits desta rodada estão isolados
— cada bloco de trabalho (o redesenho e cada correção de defeito) tem
commit próprio, com a descrição do que mudou e por quê.
